/**
 * Voice agent loop: STT → personality/business route (or custom brain) → TTS.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./stt"),
      require("./tts"),
      require("./personalities"),
      require("./business")
    );
  } else
    root.PocketVoiceAgent = factory(
      root.PocketVoiceSTT,
      root.PocketVoiceTTS,
      root.PocketVoicePersonalities,
      root.PocketVoiceBusiness
    );
})(typeof self !== "undefined" ? self : this, function (STT, TTS, Personalities, Business) {
  "use strict";

  function create(opts) {
    opts = opts || {};
    var personalityId = opts.personality || "support";
    var businessMode = opts.businessMode || "customer_service";
    var customPersonalities = opts.customPersonalities || {};
    /** async (text, ctx) => string — plug LLM / POCKET host here */
    var brain = typeof opts.brain === "function" ? opts.brain : null;
    var speakReplies = opts.speakReplies !== false;
    var bargeIn = opts.bargeIn !== false; // stop TTS when user speaks

    var history = [];
    var busy = false;

    var tts = TTS.create({
      rate: (Personalities.get(personalityId, customPersonalities) || {}).ttsRate || 1,
      lang: opts.lang || "en-US",
      remoteSpeak: opts.remoteSpeak || null,
      voiceName: opts.voiceName || "",
    });

    var stt = STT.create({
      lang: opts.lang || "en-US",
      onFinal: function (text) {
        handleUtterance(text);
      },
      onInterim: opts.onInterim || function () {},
      onState: opts.onMicState || function () {},
      onError: opts.onError || function () {},
    });

    var onReply = opts.onReply || function () {};
    var onTranscript = opts.onTranscript || function () {};

    function ctx() {
      return {
        personality: Personalities.get(personalityId, customPersonalities),
        businessMode: businessMode,
        history: history.slice(-12),
      };
    }

    function setPersonality(id) {
      personalityId = id || personalityId;
      var p = Personalities.get(personalityId, customPersonalities);
      if (p && p.ttsRate) tts.setRate(p.ttsRate);
    }

    function setBusinessMode(id) {
      businessMode = id || businessMode;
      var m = Business.getMode(businessMode);
      if (m && m.personality) setPersonality(m.personality);
    }

    function localBrain(text) {
      var routed = Business.route(businessMode, text);
      return Promise.resolve(routed.reply);
    }

    function handleUtterance(text) {
      text = String(text || "").trim();
      if (!text) return;
      onTranscript(text, "user");
      history.push({ role: "user", text: text, at: Date.now() });

      if (bargeIn) tts.cancel();

      busy = true;
      var p = brain ? Promise.resolve(brain(text, ctx())) : localBrain(text);
      p.then(function (reply) {
        reply = String(reply || "").trim() || "I didn't catch that.";
        history.push({ role: "assistant", text: reply, at: Date.now() });
        onReply(reply);
        onTranscript(reply, "assistant");
        if (speakReplies) return tts.speak(reply);
      })
        .catch(function (e) {
          var msg = "Sorry — something went wrong.";
          onReply(msg);
          if (speakReplies) return tts.speak(msg);
        })
        .then(function () {
          busy = false;
        });
    }

    function greet() {
      var p = Personalities.get(personalityId, customPersonalities);
      var g = (p && p.greeting) || "Hello.";
      onReply(g);
      if (speakReplies) return tts.speak(g);
      return Promise.resolve();
    }

    return {
      mic: stt,
      tts: tts,
      start: function () {
        return stt.start();
      },
      stop: function () {
        stt.stop();
        tts.cancel();
      },
      toggle: function () {
        return stt.toggle();
      },
      greet: greet,
      setPersonality: setPersonality,
      setBusinessMode: setBusinessMode,
      setBrain: function (fn) {
        brain = fn;
      },
      history: function () {
        return history.slice();
      },
      isBusy: function () {
        return busy;
      },
      inject: handleUtterance, // text inject without mic
    };
  }

  return { create: create };
});
