/**
 * Server-side voice engine: business + personality + patient turn config + context buffer.
 */
"use strict";

const Business = require("./business");
const Personalities = require("./personalities");
const Coding = require("./coding-core");
const Turn = require("./turn-detection");
const Flows = require("./agent-flows");

function createEngine(opts) {
  opts = opts || {};
  let businessMode = opts.businessMode || "customer_service";
  let personalityId = opts.personality || Business.getMode(businessMode).personality || "support";
  const customPersonalities = opts.customPersonalities || {};
  let brain = typeof opts.brain === "function" ? opts.brain : null;
  const history = [];
  const maxHistory = opts.maxHistory || 40;
  let flowState = opts.flow_state || null;
  let agentic = opts.agentic !== false;

  // Patient listening / hospitality defaults
  let scenario = opts.scenario || "patient";
  let stress = opts.stress != null ? opts.stress : 0.35;
  let expert = opts.expert || "hotel_host";
  let bargeIn = opts.barge_in || "medium";

  const turnMachine = Turn.createTurnMachine({
    scenario,
    stress,
    expert,
    barge_in: bargeIn,
  });
  const contextBuffer = turnMachine.buffer;

  function personality() {
    return Personalities.get(personalityId, customPersonalities);
  }

  function setPersonality(id) {
    if (id) personalityId = id;
    return personality();
  }

  function setBusinessMode(id, opts) {
    opts = opts || {};
    if (id) {
      businessMode = id;
      const m = Business.getMode(businessMode);
      // Do not clobber an explicitly chosen persona (e.g. Aria) unless forced
      if (m && m.personality && (opts.resetPersonality || !opts.keepPersonality)) {
        // Only auto-switch when still on default support/sales mapping
        if (!personalityId || personalityId === "support" || personalityId === m.personality) {
          personalityId = m.personality;
        }
      }
      if (opts.resetPersonality && m && m.personality) personalityId = m.personality;
    }
    return Business.getMode(businessMode);
  }

  function setBrain(fn) {
    brain = typeof fn === "function" ? fn : null;
  }

  function configureListening(cfg) {
    cfg = cfg || {};
    if (cfg.scenario) scenario = cfg.scenario;
    if (cfg.stress != null) stress = cfg.stress;
    if (cfg.expert) expert = cfg.expert;
    if (cfg.barge_in) bargeIn = cfg.barge_in;
    return turnMachine.configure({
      scenario,
      stress,
      expert,
      barge_in: bargeIn,
    });
  }

  function localReply(text) {
    return Business.route(businessMode, text);
  }

  /**
   * Rewrite canned business replies into the active persona's mouth.
   * Without this, "aria" is only a label while the text stays support-bot.
   */
  function personaSpeak(reply, p, utterance) {
    const raw = String(reply || "").trim();
    const u = String(utterance || "").trim();
    const name = (p && p.name) || "there";
    const id = ((p && p.id) || "").toLowerCase();

    // Identity / intro questions — speak as the persona, not the business script
    if (/\b(who are you|what('?s| is) your name|introduce yourself|are you (an? )?(ai|bot|robot))\b/i.test(u)) {
      if (id === "aria") {
        return "Hey — I'm Aria. I'm here with you on this call, calm and patient. What do you need help with?";
      }
      if (p && p.greeting) return p.greeting;
      return "I'm " + name + ". How can I help?";
    }

    if (!raw) {
      if (id === "aria") return "I'm still with you — take your time. What's on your mind?";
      return raw;
    }

    // Aria: humanize stiff support scripts
    if (id === "aria") {
      let s = raw
        .replace(/^Hi\s*[—–-]\s*thanks for reaching out\.\s*/i, "Hey — ")
        .replace(/^Hi\s*[—–-]\s*/i, "Hey — ")
        .replace(/^Hello\s*[—–-]\s*/i, "Hey — ")
        .replace(/\bI can help with billing\b/i, "I can look at the billing with you")
        .replace(/\bI want to make sure I get this right\b/i, "I want to get this right")
        .replace(/\bCan you say that again in one short sentence\?/i, "Want to say that one more time, a little shorter?")
        .replace(/\bSorry about that\b/i, "Ah, sorry about that")
        .replace(/\bI can escalate\b/i, "I can get someone else in if we need")
        .replace(/\bLet me take your name\b/i, "Could I get your name");
      // Soft openers when reply is still cold
      if (/^I can /i.test(s) && !/^I can look/i.test(s)) {
        s = "Sure — " + s.charAt(0).toLowerCase() + s.slice(1);
      }
      if (/^Connecting you/i.test(s)) {
        s = "One sec — " + s.charAt(0).toLowerCase() + s.slice(1);
      }
      return s;
    }

    // Founder / coder / executive: leave technical tone
    return raw;
  }

  /**
   * Extract simple context facts into cross-domain buffer.
   */
  function harvestContext(text, role) {
    const t = String(text || "");
    // shuttle / flight / room patterns (hospitality demo)
    const room = t.match(/\broom\s*(?:#|number|is|no\.?)?\s*(\d{2,5})\b/i);
    if (room) contextBuffer.put("hotel", "room", room[1], role);
    const flight = t.match(/\bflight\s*([A-Z]{1,3}\s?\d{2,5})\b/i);
    if (flight) contextBuffer.put("airport", "flight", flight[1], role);
    const shuttle = t.match(/\bshuttle\s+(?:at\s+)?(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/i);
    if (shuttle) contextBuffer.put("transit", "shuttle_time", shuttle[1], role);
    const checkin = t.match(/\bcheck[- ]?in\s+(?:at\s+)?(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/i);
    if (checkin) contextBuffer.put("hotel", "check_in", checkin[1], role);
  }

  async function turn(text, meta) {
    meta = meta || {};
    const utterance = String(text || "").trim();
    if (!utterance) {
      return { ok: false, error: "empty_text", reply: "" };
    }

    // Optional: evaluate turn-end (for clients that send silence_ms)
    let turnDecision = null;
    if (meta.silence_ms != null || meta.is_final != null) {
      turnDecision = Turn.shouldEndTurn({
        transcript: utterance,
        silenceMs: meta.silence_ms,
        isFinal: meta.is_final !== false,
        scenario: meta.scenario || scenario,
        stress: meta.stress != null ? meta.stress : stress,
        expert: meta.expert || expert,
        energy: meta.energy,
        speechActive: meta.speech_active,
      });
      if (meta.require_end && !turnDecision.end) {
        return {
          ok: true,
          waiting: true,
          reply: "",
          turn: turnDecision,
          mode: businessMode,
        };
      }
    }

    harvestContext(utterance, "user");
    history.push({ role: "user", text: utterance, at: Date.now() });
    if (history.length > maxHistory) history.splice(0, history.length - maxHistory);

    // Agentic multi-step flow (own playbooks)
    let flowAdvance = null;
    if (agentic || meta.agentic || meta.flow_id) {
      if (meta.flow_id) flowState = { flow_id: meta.flow_id, step_index: meta.step_index || 0 };
      flowAdvance = Flows.advance(flowState, utterance);
      if (flowAdvance && flowAdvance.active) {
        flowState = flowAdvance.state;
        if (flowAdvance.expert) expert = flowAdvance.expert;
      }
    }

    const p = personality();
    const ctxBlock = contextBuffer.toPromptBlock();
    const ctx = {
      personality: p,
      businessMode,
      history: history.slice(-12),
      context_buffer: contextBuffer.snapshot(),
      context_prompt: ctxBlock,
      agentic_flow: flowAdvance,
      listening: {
        scenario,
        stress,
        expert,
        barge_in: bargeIn,
        threshold_ms: Turn.adjustSilenceMs(
          (Turn.SCENARIOS[scenario] || Turn.SCENARIOS.patient).silence_ms,
          { stress, expert }
        ),
      },
    };

    let reply;
    let matched = false;
    let source = "business";

    if (brain) {
      try {
        reply = await Promise.resolve(brain(utterance, ctx));
        reply = String(reply || "").trim();
        source = "brain";
        matched = true;
      } catch (e) {
        const routed = localReply(utterance);
        reply = personaSpeak(routed.reply, p, utterance);
        matched = routed.matched;
        source = "business_fallback";
      }
    } else {
      const routed = localReply(utterance);
      reply = personaSpeak(routed.reply, p, utterance);
      matched = routed.matched;
      source = "persona+" + (routed.matched ? "intent" : "fallback");
      // Enrich with cross-domain buffer when present (spoken, not parenthetical dump)
      if (ctxBlock && /hotel|airport|shuttle|flight|check/i.test(utterance + " " + reply)) {
        const hotel = contextBuffer.get("hotel");
        const transit = contextBuffer.get("transit");
        const airport = contextBuffer.get("airport");
        const bits = [];
        if (hotel && hotel.length) bits.push(hotel.map((e) => e.key + " " + e.value).join(", "));
        if (transit && transit.length) bits.push(transit.map((e) => e.key + " " + e.value).join(", "));
        if (airport && airport.length) bits.push(airport.map((e) => e.key + " " + e.value).join(", "));
        if (bits.length) {
          reply = reply.replace(/\s*$/, "") + " I've got " + bits.join("; ") + " from earlier.";
        }
      }
    }

    if (!reply) {
      reply =
        (p && p.id === "aria")
          ? "I didn't quite catch that — no rush. Try again whenever you're ready."
          : "I didn't catch that. Take your time — I'm listening.";
    }

    // Soft inject agentic coach cue for multi-domain flows (spoken-friendly)
    if (flowAdvance && flowAdvance.active && flowAdvance.coach && source !== "brain") {
      if (flowAdvance.flow_id === "travel_recovery" && /delay|hotel|flight/i.test(utterance)) {
        // keep reply, append one guided next beat if not already multi-domain
        if (flowAdvance.step && flowAdvance.step.id === "hotel" && !/hotel|room|check/i.test(reply)) {
          reply = reply.replace(/\s*$/, "") + " I can also help hold a late hotel check-in if you need that.";
        }
      }
      source = source + "+flow:" + flowAdvance.flow_id;
    }

    harvestContext(reply, "assistant");
    history.push({ role: "assistant", text: reply, at: Date.now() });
    if (history.length > maxHistory) history.splice(0, history.length - maxHistory);

    // Conversational Fusion metadata — public stack emits; POCKET Deep Fusion consumes
    let fusion = null;
    try {
      fusion = turnMachine.getFusionMetadata({
        transcript: utterance,
        is_final: true,
        decision: turnDecision,
        history_length: history.length,
        stress: meta.stress != null ? meta.stress : stress,
        expert: meta.expert || expert,
        scenario: meta.scenario || scenario,
        energy: meta.energy,
        speaking_rate: meta.speaking_rate,
        industry: meta.industry || "dfw_airline_hospitality",
      });
      // Allow upstream Fusion (POCKET) to inject listening/personality weights
      if (meta.fusion_apply && typeof meta.fusion_apply === "object") {
        const fa = meta.fusion_apply;
        if (fa.stress != null || fa.expert || fa.scenario || fa.barge_in) {
          configureListening({
            stress: fa.stress != null ? fa.stress : undefined,
            expert: fa.expert || undefined,
            scenario: fa.scenario || undefined,
            barge_in: fa.barge_in || undefined,
          });
        }
        if (fa.personality) setPersonality(fa.personality);
        if (Array.isArray(fa.context_puts)) {
          fa.context_puts.forEach((row) => {
            if (row && row.domain && row.key != null) {
              contextBuffer.put(row.domain, row.key, row.value, "fusion");
            }
          });
        }
      }
    } catch (_) {
      fusion = null;
    }

    return {
      ok: true,
      reply,
      matched,
      source,
      mode: businessMode,
      personality: {
        id: p.id,
        name: p.name,
        style: p.style,
      },
      history_len: history.length,
      turn: turnDecision,
      listening: ctx.listening,
      context_buffer: contextBuffer.snapshot(),
      agentic_flow: flowAdvance,
      flow_state: flowState,
      stt: {
        engines: ["hybrid", "pocket", "webspeech"],
        schema: "pocket.stt.v1",
        own_stack: true,
      },
      fusion,
      tts_hint: {
        rate: p.ttsRate != null ? p.ttsRate : 1,
        pitch: p.ttsPitch != null ? p.ttsPitch : 1,
        text: reply,
      },
      product: "pocket-voice",
      version: "1.1.0",
    };
  }

  function greet() {
    const p = personality();
    const g = p.greeting || "Hello — take your time.";
    history.push({ role: "assistant", text: g, at: Date.now() });
    return {
      ok: true,
      reply: g,
      personality: { id: p.id, name: p.name },
      mode: businessMode,
      listening: {
        scenario,
        stress,
        expert,
        barge_in: bargeIn,
        threshold_ms: Turn.adjustSilenceMs(
          (Turn.SCENARIOS[scenario] || Turn.SCENARIOS.patient).silence_ms,
          { stress, expert }
        ),
      },
      tts_hint: { rate: p.ttsRate || 1, text: g },
    };
  }

  function codingParse(text) {
    return Coding.parseCommand(text);
  }

  function getFusionMetadata(extra) {
    return turnMachine.getFusionMetadata(
      Object.assign(
        {
          history_length: history.length,
          stress,
          expert,
          scenario,
          industry: (extra && extra.industry) || "dfw_airline_hospitality",
        },
        extra || {}
      )
    );
  }

  return {
    turn,
    greet,
    setPersonality,
    setBusinessMode,
    setBrain,
    configureListening,
    codingParse,
    decideTurn: Turn.shouldEndTurn,
    bargeIn: Turn.shouldBargeIn,
    putContext: (domain, key, value) => contextBuffer.put(domain, key, value, "api"),
    contextPrompt: () => contextBuffer.toPromptBlock(),
    getFusionMetadata,
    listFlows: Flows.listFlows,
    matchFlow: Flows.matchFlow,
    advanceFlow: (utterance) => {
      const a = Flows.advance(flowState, utterance);
      if (a && a.state) flowState = a.state;
      return a;
    },
    history: () => history.slice(),
    getState: () => ({
      businessMode,
      personalityId,
      history_len: history.length,
      flow_state: flowState,
      agentic,
      listening: {
        scenario,
        stress,
        expert,
        barge_in: bargeIn,
      },
      context_buffer: contextBuffer.snapshot(),
      stt: { engines: ["hybrid", "pocket", "webspeech"], schema: "pocket.stt.v1" },
    }),
  };
}

module.exports = { createEngine };
