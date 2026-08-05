/**
 * Server-side voice engine: business + personality + patient turn config + context buffer.
 */
"use strict";

const Business = require("./business");
const Personalities = require("./personalities");
const Coding = require("./coding-core");
const Turn = require("./turn-detection");

function createEngine(opts) {
  opts = opts || {};
  let businessMode = opts.businessMode || "customer_service";
  let personalityId = opts.personality || Business.getMode(businessMode).personality || "support";
  const customPersonalities = opts.customPersonalities || {};
  let brain = typeof opts.brain === "function" ? opts.brain : null;
  const history = [];
  const maxHistory = opts.maxHistory || 40;

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

  function setBusinessMode(id) {
    if (id) {
      businessMode = id;
      const m = Business.getMode(businessMode);
      if (m && m.personality) personalityId = m.personality;
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

    const p = personality();
    const ctxBlock = contextBuffer.toPromptBlock();
    const ctx = {
      personality: p,
      businessMode,
      history: history.slice(-12),
      context_buffer: contextBuffer.snapshot(),
      context_prompt: ctxBlock,
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
        reply = routed.reply;
        matched = routed.matched;
        source = "business_fallback";
      }
    } else {
      const routed = localReply(utterance);
      reply = routed.reply;
      matched = routed.matched;
      // Enrich with cross-domain buffer when present
      if (ctxBlock && /hotel|airport|shuttle|flight|check/i.test(utterance + " " + reply)) {
        const hotel = contextBuffer.get("hotel");
        const transit = contextBuffer.get("transit");
        const airport = contextBuffer.get("airport");
        const bits = [];
        if (hotel && hotel.length) bits.push("hotel: " + hotel.map((e) => e.key + "=" + e.value).join(", "));
        if (transit && transit.length) bits.push("transit: " + transit.map((e) => e.key + "=" + e.value).join(", "));
        if (airport && airport.length) bits.push("airport: " + airport.map((e) => e.key + "=" + e.value).join(", "));
        if (bits.length) {
          reply = reply + " (Using live context — " + bits.join("; ") + ".)";
        }
      }
    }

    if (!reply) reply = "I didn't catch that. Take your time — I'm listening.";

    harvestContext(reply, "assistant");
    history.push({ role: "assistant", text: reply, at: Date.now() });
    if (history.length > maxHistory) history.splice(0, history.length - maxHistory);

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
      tts_hint: {
        rate: p.ttsRate || 1,
        text: reply,
      },
      product: "pocket-voice",
      version: "1.0.0",
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
    history: () => history.slice(),
    getState: () => ({
      businessMode,
      personalityId,
      history_len: history.length,
      listening: {
        scenario,
        stress,
        expert,
        barge_in: bargeIn,
      },
      context_buffer: contextBuffer.snapshot(),
    }),
  };
}

module.exports = { createEngine };
