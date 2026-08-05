/**
 * Server-side / Node voice engine: business + personality + optional brain.
 * No browser mic required — perfect for HTTP API and tests.
 */
"use strict";

const Business = require("./business");
const Personalities = require("./personalities");
const Coding = require("./coding-core");

function createEngine(opts) {
  opts = opts || {};
  let businessMode = opts.businessMode || "customer_service";
  let personalityId = opts.personality || Business.getMode(businessMode).personality || "support";
  const customPersonalities = opts.customPersonalities || {};
  let brain = typeof opts.brain === "function" ? opts.brain : null;
  const history = [];
  const maxHistory = opts.maxHistory || 40;

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

  function localReply(text) {
    return Business.route(businessMode, text);
  }

  /**
   * @param {string} text
   * @returns {Promise<{ok, reply, matched, mode, personality, history_len}>}
   */
  async function turn(text) {
    const utterance = String(text || "").trim();
    if (!utterance) {
      return { ok: false, error: "empty_text", reply: "" };
    }
    history.push({ role: "user", text: utterance, at: Date.now() });
    if (history.length > maxHistory) history.splice(0, history.length - maxHistory);

    const p = personality();
    const ctx = {
      personality: p,
      businessMode,
      history: history.slice(-12),
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
    }

    if (!reply) reply = "I didn't catch that. Could you rephrase?";

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
      tts_hint: {
        rate: p.ttsRate || 1,
        text: reply,
      },
    };
  }

  function greet() {
    const p = personality();
    const g = p.greeting || "Hello.";
    history.push({ role: "assistant", text: g, at: Date.now() });
    return {
      ok: true,
      reply: g,
      personality: { id: p.id, name: p.name },
      mode: businessMode,
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
    codingParse,
    history: () => history.slice(),
    getState: () => ({
      businessMode,
      personalityId,
      history_len: history.length,
    }),
  };
}

module.exports = { createEngine };
