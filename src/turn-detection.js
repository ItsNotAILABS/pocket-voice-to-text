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

/** Lightweight entity harvest for fusion metadata (no heavy NLP). */
const ENTITY_PATTERNS = [
  { type: "flight", re: /\b(?:flight\s*)?([A-Z]{1,3}\s?\d{2,5})\b/i },
  { type: "flight_status", re: /\b(delayed|cancelled|canceled|boarding|on time|diverted|missed connection)\b/i },
  { type: "gate", re: /\bgate\s*([A-Z]?\d{1,3}[A-Z]?)\b/i },
  { type: "room", re: /\broom\s*(?:#|number|is|no\.?)?\s*(\d{2,5})\b/i },
  { type: "hotel", re: /\b(hotel|marriott|hilton|hyatt|westin|sheraton|courtyard|residence inn)\b/i },
  { type: "check_in", re: /\bcheck[- ]?in\b/i },
  { type: "shuttle", re: /\b(shuttle|rideshare|uber|lyft|taxi|skytrain|dart)\b/i },
  { type: "dining", re: /\b(restaurant|dining|food|eat|hungry|reservation)\b/i },
  { type: "bag", re: /\b(bag|baggage|luggage|claim)\b/i },
  { type: "need", re: /\b(?:need|want|looking for)\s+(?:a\s+|the\s+)?([a-z][a-z\s]{2,24})/i },
  { type: "confirmation", re: /\b(?:conf(?:irmation)?|pnr|record locator)\s*(?:#|is|:)?\s*([A-Z0-9]{5,8})\b/i },
  { type: "airport_code", re: /\b(DFW|DAL|AA|American Airlines|Terminal\s*[A-E])\b/i },
];

function extractEntities(text) {
  const t = String(text || "");
  const out = [];
  const seen = {};
  for (let i = 0; i < ENTITY_PATTERNS.length; i++) {
    const p = ENTITY_PATTERNS[i];
    const m = t.match(p.re);
    if (m) {
      const value = (m[1] || m[0] || "").toString().trim();
      const key = p.type + ":" + value.toLowerCase();
      if (value && !seen[key]) {
        seen[key] = true;
        out.push({ type: p.type, value: value.slice(0, 64) });
      }
    }
  }
  return out;
}

function trailingCues(text) {
  const t = String(text || "").trim();
  const cues = [];
  for (let i = 0; i < TRAILING_INCOMPLETE.length; i++) {
    if (TRAILING_INCOMPLETE[i].test(t)) {
      const m = t.match(TRAILING_INCOMPLETE[i]);
      if (m) cues.push(String(m[0] || m[1] || "incomplete").trim().slice(0, 24));
    }
  }
  return cues.slice(0, 4);
}

function entityDensity(text, entities) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length || 1;
  const n = (entities && entities.length) || 0;
  return Math.max(0, Math.min(1, n / Math.max(3, words * 0.35)));
}

function pausePatternFrom(silenceMs, speechActive, incomplete) {
  if (speechActive) return "active";
  const s = Number(silenceMs) || 0;
  if (incomplete && s > 700) return "long_thinking";
  if (s > 1400) return "long_thinking";
  if (s > 500) return "normal";
  if (s > 0 && s < 250) return "short";
  if (incomplete) return "fragmented";
  return "normal";
}

function flattenContextBuffer(snapshot) {
  const snap = snapshot || {};
  const out = {};
  Object.keys(snap).forEach((domain) => {
    const list = snap[domain] || [];
    const bag = {};
    list.forEach((e) => {
      if (e && e.key != null) bag[e.key] = e.value;
    });
    out[domain] = bag;
  });
  return out;
}

function guessCandidateExperts(text, activeExpert, entities) {
  const t = String(text || "").toLowerCase();
  const scores = {
    airport_guide: 0,
    hotel_host: 0,
    transit_concierge: 0,
    dining_diplomat: 0,
    support: 0,
  };
  if (/flight|gate|delay|baggage|terminal|dfw|boarding|connection/.test(t)) scores.airport_guide += 2;
  if (/hotel|room|check[- ]?in|reservation|stay|hold my room/.test(t)) scores.hotel_host += 2;
  if (/shuttle|rideshare|uber|lyft|taxi|transit|train/.test(t)) scores.transit_concierge += 2;
  if (/restaurant|dining|eat|food|hungry|menu/.test(t)) scores.dining_diplomat += 2;
  if (/refund|cancel|bill|charge|support|agent/.test(t)) scores.support += 1.5;
  (entities || []).forEach((e) => {
    if (e.type === "flight" || e.type === "flight_status" || e.type === "gate" || e.type === "bag") scores.airport_guide += 1.2;
    if (e.type === "room" || e.type === "hotel" || e.type === "check_in") scores.hotel_host += 1.2;
    if (e.type === "shuttle") scores.transit_concierge += 1.2;
    if (e.type === "dining") scores.dining_diplomat += 1.2;
  });
  if (activeExpert && scores[activeExpert] != null) scores[activeExpert] += 0.4;
  return Object.keys(scores)
    .map((id) => ({ id, score: scores[id] }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.id);
}

function dominantDomainFromBuffer(snapshot, activeExpert) {
  const flat = flattenContextBuffer(snapshot);
  const order = ["airport", "hotel", "transit", "dining", "support"];
  let best = (DOMAIN_EXPERTS[activeExpert] && DOMAIN_EXPERTS[activeExpert].domain) || "general";
  let bestN = -1;
  order.forEach((d) => {
    const n = flat[d] ? Object.keys(flat[d]).length : 0;
    if (n > bestN) {
      bestN = n;
      best = d;
    }
  });
  return best;
}

function userStateFrom(stress, entities, text) {
  const s = Math.max(0, Math.min(1, Number(stress) || 0));
  const t = String(text || "").toLowerCase();
  if (s >= 0.55 || /delayed|missed|urgent|asap|frustrated|angry/.test(t)) return "stressed_traveler";
  if (/tired|exhausted|long day|late night/.test(t)) return "fatigued_traveler";
  if ((entities || []).some((e) => e.type === "flight_status" && /delay/i.test(e.value))) return "disrupted_passenger";
  if (s < 0.25) return "calm_guest";
  return "active_guest";
}

/**
 * Conversational Fusion input vector (v1.0).
 * Emitted by the public voice stack; industry Deep Fusion lives in POCKET host.
 */
function buildFusionMetadata(input) {
  input = input || {};
  const transcript = String(input.transcript || input.text || "");
  const entities = input.entities || extractEntities(transcript);
  const incomplete = input.incomplete != null ? !!input.incomplete : isLinguisticallyIncomplete(transcript);
  const complete = input.complete != null ? !!input.complete : isLinguisticallyComplete(transcript);
  const stress = Math.max(0, Math.min(1, Number(input.stress != null ? input.stress : 0.35)));
  const energy = typeof input.energy === "number" ? input.energy : 0;
  const speechActive = input.speechActive === true;
  const silenceMs = Number(input.silence_ms != null ? input.silence_ms : input.silenceMs) || 0;
  const speakingRate =
    typeof input.speaking_rate === "number"
      ? input.speaking_rate
      : typeof input.speakingRate === "number"
        ? input.speakingRate
        : 0.85;
  const scenario = input.scenario || "patient";
  const expert = input.expert || "hotel_host";
  const decision = input.decision || input.turn || null;
  const threshold =
    (decision && decision.threshold_ms) ||
    adjustSilenceMs((SCENARIOS[scenario] || SCENARIOS.patient).silence_ms, {
      stress,
      expert,
      speakingRate,
    });
  const candidates = guessCandidateExperts(transcript, expert, entities);
  const conf =
    candidates[0] === expert
      ? 0.72
      : candidates.length
        ? 0.55 + Math.min(0.3, (entities.length || 0) * 0.06)
        : 0.4;
  const contextSnap = input.context_buffer || input.context || {};
  const flatCtx = (function normalizeCtx(snap) {
    const keys = Object.keys(snap || {});
    if (!keys.length) return {};
    const sample = snap[keys[0]];
    if (Array.isArray(sample)) return flattenContextBuffer(snap);
    // already flat { domain: { key: val } }
    if (sample && typeof sample === "object") {
      const out = {};
      keys.forEach((d) => {
        out[d] = snap[d] && typeof snap[d] === "object" && !Array.isArray(snap[d]) ? snap[d] : {};
      });
      return out;
    }
    return flattenContextBuffer(snap);
  })(contextSnap);

  return {
    version: "1.0",
    schema: "pocket.voice.fusion_metadata.v1",
    session_id: input.session_id || input.sessionId || null,
    timestamp: Math.floor(Date.now() / 1000),
    turn_id: input.turn_id || input.turnId || "t_" + Date.now().toString(36),
    acoustic: {
      stress: Math.round(stress * 1000) / 1000,
      speaking_rate: Math.round(speakingRate * 1000) / 1000,
      energy_mean: Math.round(energy * 1000) / 1000,
      energy_var: typeof input.energy_var === "number" ? input.energy_var : Math.round(energy * 0.25 * 1000) / 1000,
      pause_pattern: pausePatternFrom(silenceMs, speechActive, incomplete),
      speech_active_ratio:
        typeof input.speech_active_ratio === "number"
          ? input.speech_active_ratio
          : speechActive
            ? 0.7
            : silenceMs > 400
              ? 0.25
              : 0.5,
    },
    linguistic: {
      transcript: transcript.slice(0, 2000),
      is_final: input.is_final !== false && input.isFinal !== false,
      incomplete,
      complete,
      reason: (decision && decision.reason) || (incomplete ? "semantic_incomplete" : complete ? "complete" : "waiting"),
      entity_density: Math.round(entityDensity(transcript, entities) * 1000) / 1000,
      entities,
      trailing_cues: trailingCues(transcript),
    },
    turn: {
      scenario,
      threshold_ms: threshold,
      silence_ms: silenceMs,
      decision: decision ? (decision.end ? "end" : "waiting") : silenceMs >= threshold ? "end" : "waiting",
      barge_in_sensitivity: input.barge_in || input.sensitivity || "medium",
      end: decision ? !!decision.end : null,
      decide_reason: decision ? decision.reason : null,
    },
    domain: {
      active_expert: expert,
      candidate_experts: candidates.length ? candidates : [expert],
      confidence: Math.round(conf * 1000) / 1000,
      industry: input.industry || "dfw_airline_hospitality",
    },
    context_buffer: flatCtx,
    session: {
      history_length: Number(input.history_length) || Number(input.historyLength) || 0,
      dominant_domain: dominantDomainFromBuffer(
        // rebuild list shape for dominantDomain if needed
        (function () {
          const out = {};
          Object.keys(flatCtx).forEach((d) => {
            out[d] = Object.keys(flatCtx[d] || {}).map((k) => ({ key: k, value: flatCtx[d][k] }));
          });
          return out;
        })(),
        expert
      ),
      user_state: userStateFrom(stress, entities, transcript),
    },
  };
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
  let energySamples = [];
  let turnCounter = 0;
  let sessionId = opts.session_id || opts.sessionId || null;
  const buffer = createContextBuffer(opts.buffer);

  function configure(cfg) {
    cfg = cfg || {};
    if (cfg.scenario) scenario = cfg.scenario;
    if (cfg.stress != null) stress = cfg.stress;
    if (cfg.expert) expert = cfg.expert;
    if (cfg.barge_in) sensitivity = cfg.barge_in;
    if (cfg.session_id) sessionId = cfg.session_id;
    return state();
  }

  function onAudio(frame) {
    frame = frame || {};
    if (typeof frame.energy === "number") {
      energy = frame.energy;
      energySamples.push(energy);
      if (energySamples.length > 40) energySamples.shift();
    }
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

  function energyStats() {
    if (!energySamples.length) return { mean: energy, variance: 0 };
    const mean = energySamples.reduce((a, b) => a + b, 0) / energySamples.length;
    const variance =
      energySamples.reduce((a, b) => a + (b - mean) * (b - mean), 0) / energySamples.length;
    return { mean, variance };
  }

  function getFusionMetadata(extra) {
    extra = extra || {};
    const decision = extra.decision || decide(extra.is_final || extra.isFinal);
    const est = energyStats();
    turnCounter += 1;
    return buildFusionMetadata({
      session_id: sessionId || extra.session_id,
      turn_id: extra.turn_id || "t_" + turnCounter,
      transcript: extra.transcript != null ? extra.transcript : transcript,
      is_final: extra.is_final != null ? extra.is_final : extra.isFinal,
      stress: extra.stress != null ? extra.stress : stress,
      expert: extra.expert || expert,
      scenario: extra.scenario || scenario,
      barge_in: sensitivity,
      energy: est.mean,
      energy_var: Math.round(est.variance * 1000) / 1000,
      speechActive,
      silence_ms: silenceMs(),
      speaking_rate: extra.speaking_rate,
      decision,
      context_buffer: buffer.snapshot(),
      history_length: extra.history_length,
      industry: extra.industry || "dfw_airline_hospitality",
      incomplete: decision.incomplete,
      complete: decision.complete,
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
    getFusionMetadata,
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
  extractEntities,
  buildFusionMetadata,
  FUSION_SCHEMA: "pocket.voice.fusion_metadata.v1",
  FUSION_VERSION: "1.0",
};

if (typeof module === "object" && module.exports) {
  module.exports = api;
} else if (typeof window !== "undefined") {
  window.PocketVoiceTurn = api;
}
