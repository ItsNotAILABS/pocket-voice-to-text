/**
 * Pocket Voice Stack — facade for STT, TTS, agents, business, coding.
 * Load after stt.js, tts.js, personalities.js, business.js, agent.js, coding.js
 * or use the demo HTML that includes them in order.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./stt"),
      require("./tts"),
      require("./personalities"),
      require("./business"),
      require("./agent"),
      require("./coding")
    );
  } else {
    root.PocketVoiceStack = factory(
      root.PocketVoiceSTT,
      root.PocketVoiceTTS,
      root.PocketVoicePersonalities,
      root.PocketVoiceBusiness,
      root.PocketVoiceAgent,
      root.PocketVoiceCoding
    );
    // legacy
    if (root.PocketVoiceSTT) root.PocketVoice = root.PocketVoiceSTT;
  }
})(typeof self !== "undefined" ? self : this, function (STT, TTS, Personalities, Business, Agent, Coding) {
  "use strict";

  function create(opts) {
    opts = opts || {};
    var mode = opts.mode || "stt"; // stt | agent | coding | business

    var sttOnly = STT.create({
      lang: opts.lang,
      onFinal: opts.onTranscript || opts.onFinal || function () {},
      onInterim: opts.onInterim || function () {},
      onState: opts.onState || function () {},
      onError: opts.onError || function () {},
    });

    var agent =
      mode === "agent" || mode === "business"
        ? Agent.create({
            personality: opts.personality || (mode === "business" ? "support" : "coder"),
            businessMode: opts.businessMode || "customer_service",
            brain: opts.brain || null,
            speakReplies: opts.speakReplies !== false,
            remoteSpeak: opts.remoteSpeak,
            onReply: opts.onSpeak || opts.onReply || function () {},
            onTranscript: function (t, who) {
              if (opts.onTranscript) opts.onTranscript(t, who);
            },
            onMicState: opts.onState || function () {},
            onError: opts.onError || function () {},
            lang: opts.lang,
          })
        : null;

    if (agent && mode === "business" && opts.businessMode) {
      agent.setBusinessMode(opts.businessMode);
    }

    var coding =
      mode === "coding"
        ? Coding.create({
            target: opts.target,
            onDictate: opts.onTranscript || function () {},
            onCommand: opts.onCommand || function () {},
            onStatus: opts.onSpeak || function () {},
            speakStatus: opts.speakStatus !== false,
            remoteSpeak: opts.remoteSpeak,
            lang: opts.lang,
          })
        : null;

    function mic() {
      if (agent) return agent.mic;
      if (coding) return coding.mic;
      return sttOnly;
    }

    return {
      mode: mode,
      mic: mic(),
      agent: agent,
      coding: coding,
      stt: sttOnly,
      tts: agent ? agent.tts : coding ? coding.tts : TTS.create(opts),
      personalities: Personalities,
      business: Business,
      toggle: function () {
        return mic().toggle();
      },
      start: function () {
        return mic().start();
      },
      stop: function () {
        return mic().stop();
      },
      greet: function () {
        return agent ? agent.greet() : Promise.resolve();
      },
      setPersonality: function (id) {
        if (agent) agent.setPersonality(id);
      },
      setBusinessMode: function (id) {
        if (agent) agent.setBusinessMode(id);
      },
      /** Wire a POCKET/LLM brain: async (text, ctx) => replyString */
      setBrain: function (fn) {
        if (agent) agent.setBrain(fn);
      },
      announceJob: function (r) {
        if (coding) coding.announceJob(r);
      },
    };
  }

  return {
    create: create,
    STT: STT,
    TTS: TTS,
    Personalities: Personalities,
    Business: Business,
    Agent: Agent,
    Coding: Coding,
    version: "0.2.0",
  };
});
