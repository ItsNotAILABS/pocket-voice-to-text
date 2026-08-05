/**
 * Hybrid turn detection — patient listening for real conversations.
 *
 * Pure logic (Node + browser). Does NOT require Silero/WebRTC models.
 * Combines:
 *   - Configurable silence thresholds by scenario
 *   - Semantic/linguistic completeness (partial transcripts)
 *   - Stress-aware adjustment (raises patience under stress)
 *   - Cross-domain contextual buffer (travel, hospitality, ops)
 *
 * Use with browser STT: feed interim/final transcripts + optional energy.
 * Swap energy source for Silero/ONNX later without changing this API.
 */
"use strict";

/** Recommended silence thresholds (ms) — travel/hospitality tuned */
const SCENARIOS = {
  fast_command: {
    id: "fast_command",
    label: "Fast command / sales",
    silence_ms: 300,
    barge_in: "high",
    notes: "Snappy; risk of mid-sentence cuts",
  },
  standard: {
    id: "standard",
    label: "Standard conversation",
    silence_ms: 650,
    barge_in: "medium",
    notes: "Balanced",
  },
  patient: {
    id: "patient",
    label: "Patient / high-stress (travel, healthcare)",
    silence_ms: 1400,
    barge_in: "medium",
    notes: "Allows thinking pauses and multi-part explanations",
  },
  dictation: {
    id: "dictation",
    label: "Dictation / complex data",
    silence_ms: 2000,
    barge_in: "low",
    notes: "Account numbers, addresses, multi-part data",
  },
};

/** Domain experts for cross-domain buffer (travel stack etc.) */
const DOMAIN_EXPERTS = {
  airport_guide: { id: "airport_guide", domain: "airport", label: "Airport Guide" },
  transit_concierge: { id: "transit_concierge", domain: "transit", label: "Transit Concierge" },
  hotel_host: { id: "hotel_host", domain: "hotel", label: "Hotel Host" },
  dining_diplomat: { id: "dining_diplomat", domain: "dining", label: "Dining Diplomat" },
  support: { id: "support", domain: "support", label: "Support" },
  sales: { id: "sales", domain: "sales", label: "Sales" },
  coder: { id: "coder", domain: "engineering", label: "Coding pair" },
};

// Incomplete linguistic cues — do NOT end turn yet
const TRAILING_INCOMPLETE = [
  /\b(um+|uh+|er+|hmm+|ah+)\s*$/i,
  /\b(and|or|but|so|because|if|when|while|then|also|with|for|to|the|a|an)\s*$/i,
  /\b(my|your|their|its|our)\s*$/i,
  /[–—,;:]\s*$/,
  /\b(number|address|email|code|flight|room)\s*(is|:)?\s*$/i,
  /\d{1,3}[-\s]?$/, // mid digit sequence
];

// Strong end-of-turn cues
const COMPLETE_CUES = [
  /[.!?…]\s*$/,
  /\b(thanks|thank you|that's all|that is all|goodbye|bye|please)\s*[.!?]?\s*$/i,
  /\b(yes|no|correct|right|okay|ok)\s*[.!?]?\s*$/i,
];

function listScenarios() {
  return Object.values(SCENARIOS).map((s) => ({
    id: s.id,
    label: s.label,
    silence_ms: s.silence_ms,
    barge_in: s.barge_in,
    notes: s.notes,
  }));
}

function listExperts() {
  return Object.values(DOMAIN_EXPERTS);
}

function isLinguisticallyIncomplete(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (t.length < 2) return true;
  for (let i = 0; i < TRAILING_INCOMPLETE.length; i++) {
    if (TRAILING_INCOMPLETE[i].test(t)) return true;
  }
  // open quote
  const q = (t.match(/"/g) || []).length;
  if (q % 2 === 1) return true;
  return false;
}

function isLinguisticallyComplete(text) {
  const t = String(text || "").trim();
  if (!t || isLinguisticallyIncomplete(t)) return false;
  for (let i = 0; i < COMPLETE_CUES.length; i++) {
    if (COMPLETE_CUES[i].test(t)) return true;
  }
  // medium length sentence without incomplete tail
  if (t.split(/\s+/).length >= 4 && !/[,;]\s*$/.test(t)) return true;
  return false;
}

/**
 * Stress-aware silence: raise threshold when stress signals present.
 * @param {number} baseMs
 * @param {{stress?: number, expert?: string, speakingRate?: number}} ctx
 */
function adjustSilenceMs(baseMs, ctx) {
  ctx = ctx || {};
  let ms = baseMs;
  const stress = Number(ctx.stress);
  if (!isNaN(stress) && stress > 0) {
    // stress 0..1 → up to +600ms
    ms += Math.round(Math.min(1, Math.max(0, stress)) * 600);
  }
  // slower speech → more patience
  const rate = Number(ctx.speakingRate);
  if (!isNaN(rate) && rate > 0 && rate < 0.9) {
    ms += Math.round((0.9 - rate) * 400);
  }
  // domain experts that need multi-part answers
  const expert = (ctx.expert || ctx.contextExpert || "").toLowerCase();
  if (/airport|hotel|transit|travel|health|patient|dining/.test(expert)) {
    ms = Math.max(ms, 1200);
  }
  // clamp
  return Math.max(200, Math.min(3000, ms));
}

/**
 * Hybrid end-of-turn decision.
 * @param {object} input
 * @param {string} input.transcript - partial or final text
 * @param {number} [input.silenceMs] - observed silence after last speech energy
 * @param {boolean} [input.isFinal] - STT final segment flag
 * @param {string} [input.scenario] - fast_command|standard|patient|dictation
 * @param {number} [input.stress] - 0..1
 * @param {string} [input.expert] - active context expert id
 * @param {number} [input.energy] - optional 0..1 audio energy (from future Silero/WebAudio)
 * @param {boolean} [input.speechActive] - optional VAD speech flag
 */
function shouldEndTurn(input) {
  input = input || {};
  const scenario = SCENARIOS[input.scenario] || SCENARIOS.patient;
  const threshold = adjustSilenceMs(scenario.silence_ms, {
    stress: input.stress,
    expert: input.expert,
    speakingRate: input.speakingRate,
  });
  const silence = Number(input.silenceMs);
  const hasSilence = !isNaN(silence);
  const transcript = String(input.transcript || "");
  const incomplete = isLinguisticallyIncomplete(transcript);
  const complete = isLinguisticallyComplete(transcript);

  // If energy says still speaking, never end
  if (input.speechActive === true || (typeof input.energy === "number" && input.energy > 0.35)) {
    return {
      end: false,
      reason: "speech_active",
      threshold_ms: threshold,
      scenario: scenario.id,
      incomplete,
      complete,
    };
  }

  // Semantic gate: incomplete language → wait even if silence met
  if (incomplete && hasSilence && silence < threshold + 800) {
    return {
      end: false,
      reason: "semantic_incomplete",
      threshold_ms: threshold,
      scenario: scenario.id,
      incomplete: true,
      complete: false,
      extend_ms: 800,
    };
  }

  // STT final + complete language → end (or silence met)
  if (input.isFinal && complete) {
    return {
      end: true,
      reason: "final_complete",
      threshold_ms: threshold,
      scenario: scenario.id,
      incomplete: false,
      complete: true,
    };
  }

  if (hasSilence && silence >= threshold) {
    // Silence met — if incomplete, only end after extra grace
    if (incomplete && silence < threshold + 1000) {
      return {
        end: false,
        reason: "silence_but_incomplete",
        threshold_ms: threshold,
        scenario: scenario.id,
        incomplete: true,
        complete: false,
      };
    }
    return {
      end: true,
      reason: "silence_threshold",
      threshold_ms: threshold,
      scenario: scenario.id,
      incomplete,
      complete,
    };
  }

  return {
    end: false,
    reason: "waiting",
    threshold_ms: threshold,
    scenario: scenario.id,
    incomplete,
    complete,
    silence_ms: hasSilence ? silence : null,
  };
}

/**
 * Barge-in: should we cancel TTS given sensitivity + agent busy state?
 * sensitivity: high | medium | low
 */
function shouldBargeIn(input) {
  input = input || {};
  const sens = (input.sensitivity || "medium").toLowerCase();
  const energy = Number(input.energy);
  const hasSpeech = input.speechActive === true || (!isNaN(energy) && energy > 0.4);
  const interim = String(input.interim || input.transcript || "").trim();
  if (!hasSpeech && interim.length < 2) return { barge: false, reason: "no_speech" };

  if (sens === "low") {
    // only barge on clear words, not noise
    if (interim.split(/\s+/).length >= 2) return { barge: true, reason: "low_sens_words" };
    return { barge: false, reason: "low_sens_wait" };
  }
  if (sens === "high") {
    return { barge: hasSpeech || interim.length > 0, reason: "high_sens" };
  }
  // medium — default patient agents
  if (interim.length >= 3 || (hasSpeech && interim.length >= 1)) {
    return { barge: true, reason: "medium_sens" };
  }
  return { barge: false, reason: "medium_wait" };
}

/**
 * Cross-domain contextual buffer — keeps state from Airport / Hotel / Transit etc.
 */
function createContextBuffer(opts) {
  opts = opts || {};
  const maxPerDomain = opts.maxPerDomain || 12;
  const maxDomains = opts.maxDomains || 16;
  /** @type {Record<string, Array<{at:number,key:string,value:any,source:string}>>} */
  const store = {};

  function put(domain, key, value, source) {
    domain = String(domain || "general");
    key = String(key || "note");
    if (!store[domain]) {
      const keys = Object.keys(store);
      if (keys.length >= maxDomains) delete store[keys[0]];
      store[domain] = [];
    }
    store[domain] = store[domain].filter((e) => e.key !== key);
    store[domain].unshift({
      at: Date.now(),
      key,
      value,
      source: source || "agent",
    });
    if (store[domain].length > maxPerDomain) {
      store[domain] = store[domain].slice(0, maxPerDomain);
    }
    return { ok: true, domain, key };
  }

  function get(domain, key) {
    const list = store[domain] || [];
    if (!key) return list.slice();
    return list.find((e) => e.key === key) || null;
  }

  function snapshot(domains) {
    const out = {};
    const keys = domains && domains.length ? domains : Object.keys(store);
    keys.forEach((d) => {
      if (store[d]) out[d] = store[d].slice(0, 8);
    });
    return out;
  }

  /** Text block for LLM / engine context injection */
  function toPromptBlock(domains) {
    const snap = snapshot(domains);
    const lines = ["# Cross-domain context buffer"];
    Object.keys(snap).forEach((d) => {
      lines.push(`## ${d}`);
      snap[d].forEach((e) => {
        lines.push(`- ${e.key}: ${typeof e.value === "string" ? e.value : JSON.stringify(e.value)}`);
      });
    });
    return lines.length > 1 ? lines.join("\n") : "";
  }

  function clear(domain) {
    if (domain) delete store[domain];
    else Object.keys(store).forEach((k) => delete store[k]);
  }

  return { put, get, snapshot, toPromptBlock, clear, experts: DOMAIN_EXPERTS };
}

/**
 * Stateful turn machine for one session.
 */
function createTurnMachine(opts) {
  opts = opts || {};
  let scenario = opts.scenario || "patient";
  let stress = opts.stress != null ? opts.stress : 0;
  let expert = opts.expert || "hotel_host";
  let sensitivity = opts.barge_in || (SCENARIOS[scenario] || SCENARIOS.patient).barge_in;
  let lastSpeechAt = 0;
  let transcript = "";
  let speechActive = false;
  let energy = 0;
  const buffer = createContextBuffer(opts.buffer);

  function configure(cfg) {
    cfg = cfg || {};
    if (cfg.scenario) scenario = cfg.scenario;
    if (cfg.stress != null) stress = cfg.stress;
    if (cfg.expert) expert = cfg.expert;
    if (cfg.barge_in) sensitivity = cfg.barge_in;
    return state();
  }

  function onAudio(frame) {
    frame = frame || {};
    if (typeof frame.energy === "number") energy = frame.energy;
    if (typeof frame.speechActive === "boolean") speechActive = frame.speechActive;
    else if (energy > 0.35) speechActive = true;
    else if (energy < 0.15) speechActive = false;
    if (speechActive) lastSpeechAt = Date.now();
  }

  function onTranscript(text, isFinal) {
    if (text) {
      transcript = String(text);
      lastSpeechAt = Date.now();
    }
    return decide(isFinal);
  }

  function silenceMs() {
    if (!lastSpeechAt) return 0;
    return Date.now() - lastSpeechAt;
  }

  function decide(isFinal) {
    return shouldEndTurn({
      transcript,
      silenceMs: silenceMs(),
      isFinal: !!isFinal,
      scenario,
      stress,
      expert,
      energy,
      speechActive,
    });
  }

  function bargeCheck(interim) {
    return shouldBargeIn({
      sensitivity,
      energy,
      speechActive,
      interim: interim || transcript,
    });
  }

  function state() {
    const sc = SCENARIOS[scenario] || SCENARIOS.patient;
    return {
      scenario,
      stress,
      expert,
      barge_in: sensitivity,
      silence_ms: silenceMs(),
      threshold_ms: adjustSilenceMs(sc.silence_ms, { stress, expert }),
      transcript,
      speechActive,
      energy,
      context: buffer.snapshot(),
    };
  }

  return {
    configure,
    onAudio,
    onTranscript,
    decide,
    bargeCheck,
    state,
    buffer,
    putContext: buffer.put,
    contextPrompt: buffer.toPromptBlock,
  };
}

// UMD
const api = {
  SCENARIOS,
  DOMAIN_EXPERTS,
  listScenarios,
  listExperts,
  isLinguisticallyIncomplete,
  isLinguisticallyComplete,
  adjustSilenceMs,
  shouldEndTurn,
  shouldBargeIn,
  createContextBuffer,
  createTurnMachine,
};

if (typeof module === "object" && module.exports) {
  module.exports = api;
} else if (typeof window !== "undefined") {
  window.PocketVoiceTurn = api;
}
