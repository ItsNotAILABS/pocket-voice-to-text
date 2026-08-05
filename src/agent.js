/**
 * Voice agent loop: patient STT (hybrid VAD) → personality/business → TTS.
 * Voice-to-voice with optional classic STT (patient: false).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./stt"),
      require("./tts"),
      require("./personalities"),
      require("./business"),
      require("./stt-patient")
    );
  } else
    root.PocketVoiceAgent = factory(
      root.PocketVoiceSTT,
      root.PocketVoiceTTS,
      root.PocketVoicePersonalities,
      root.PocketVoiceBusiness,
      root.PocketVoicePatientSTT
    );
})(typeof self !== "undefined" ? self : this, function (STT, TTS, Personalities, Business, PatientSTT) {
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
    var usePatient = opts.patient !== false && PatientSTT && typeof PatientSTT.create === "function";

    var history = [];
    var busy = false;
    var lastListening = null;

    var tts = TTS.create({
      rate: (Personalities.get(personalityId, customPersonalities) || {}).ttsRate || 1,
      lang: opts.lang || "en-US",
      remoteSpeak: opts.remoteSpeak || null,
      voiceName: opts.voiceName || "",
    });

    var patient = null;
    var stt = null;

    if (usePatient) {
      patient = PatientSTT.create({
        lang: opts.lang || "en-US",
        scenario: opts.scenario || "patient",
        stress: opts.stress || 0,
        expert: opts.expert || "hotel_host",
        barge_in: opts.barge_in || opts.bargeInSensitivity || "medium",
        onTurn: function (text, meta) {
          if (meta && meta.state) lastListening = meta.state;
          handleUtterance(text);
        },
        onPartial: opts.onInterim || function () {},
        onBargeIn: function (b) {
          if (bargeIn) tts.cancel();
          if (typeof opts.onBargeIn === "function") opts.onBargeIn(b);
        },
        onState: opts.onMicState || function () {},
        onError: opts.onError || function () {},
      });
      stt = patient.mic;
    } else {
      stt = STT.create({
        lang: opts.lang || "en-US",
        onFinal: function (text) {
          handleUtterance(text);
        },
        onInterim: function (text) {
          if (bargeIn && text && String(text).trim().length > 1) tts.cancel();
          if (typeof opts.onInterim === "function") opts.onInterim(text);
        },
        onState: opts.onMicState || function () {},
        onError: opts.onError || function () {},
      });
    }

    var onReply = opts.onReply || function () {};
    var onTranscript = opts.onTranscript || function () {};

    function ctx() {
      var c = {
        personality: Personalities.get(personalityId, customPersonalities),
        businessMode: businessMode,
        history: history.slice(-12),
        listening: lastListening || (patient ? patient.state() : null),
        patient: !!usePatient,
      };
      if (patient && patient.machine && patient.machine.buffer) {
        c.context_buffer = patient.machine.buffer.snapshot();
        c.context_prompt = patient.machine.buffer.toPromptBlock
          ? patient.machine.buffer.toPromptBlock()
          : "";
      }
      return c;
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
      var reply = routed.reply;
      // Enrich with cross-domain buffer when patient path holds hospitality facts
      if (patient && patient.machine && patient.machine.buffer) {
        var snap = patient.machine.buffer.snapshot();
        var hotel = snap.hotel || [];
        var transit = snap.transit || [];
        var airport = snap.airport || [];
        if (/hotel|airport|shuttle|flight|check|room/i.test(text + " " + reply)) {
          var bits = [];
          if (hotel.length) bits.push("hotel: " + hotel.map(function (e) { return e.key + "=" + e.value; }).join(", "));
          if (transit.length) bits.push("transit: " + transit.map(function (e) { return e.key + "=" + e.value; }).join(", "));
          if (airport.length) bits.push("airport: " + airport.map(function (e) { return e.key + "=" + e.value; }).join(", "));
          if (bits.length) reply = reply + " (Using live context — " + bits.join("; ") + ".)";
        }
      }
      return Promise.resolve(reply);
    }

    function handleUtterance(text) {
      text = String(text || "").trim();
      if (!text) return;
      onTranscript(text, "user");
      history.push({ role: "user", text: text, at: Date.now() });

      // Harvest simple hospitality facts into patient buffer
      if (patient && typeof patient.putContext === "function") {
        var room = text.match(/\broom\s*(?:#|number|is|no\.?)?\s*(\d{2,5})\b/i);
        if (room) patient.putContext("hotel", "room", room[1]);
        var shuttle = text.match(/\bshuttle\s*(?:at|is|time)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
        if (shuttle) patient.putContext("transit", "shuttle_time", shuttle[1].trim());
        var checkIn = text.match(/\bcheck[-\s]?in\s*(?:at|is)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
        if (checkIn) patient.putContext("hotel", "check_in", checkIn[1].trim());
      }

      if (bargeIn) tts.cancel();

      busy = true;
      var p = brain ? Promise.resolve(brain(text, ctx())) : localBrain(text);
      p.then(function (reply) {
        reply = String(reply || "").trim() || "I didn't catch that. Take your time — I'm listening.";
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
      var g = (p && p.greeting) || "Hello. Take your time — I'm listening.";
      onReply(g);
      if (speakReplies) return tts.speak(g);
      return Promise.resolve();
    }

    function startMic() {
      if (patient) return patient.start();
      return stt.start();
    }

    function stopMic() {
      if (patient) patient.stop();
      else stt.stop();
      tts.cancel();
    }

    return {
      mic: stt,
      patient: patient,
      tts: tts,
      start: startMic,
      stop: stopMic,
      toggle: function () {
        if (patient) return patient.toggle();
        return stt.toggle();
      },
      greet: greet,
      setPersonality: setPersonality,
      setBusinessMode: setBusinessMode,
      setBrain: function (fn) {
        brain = fn;
      },
      /** Configure patient VAD: scenario, stress, expert, barge_in */
      configureListening: function (cfg) {
        if (patient && patient.configure) {
          lastListening = patient.configure(cfg);
          return lastListening;
        }
        return null;
      },
      putContext: function (domain, key, value) {
        if (patient && patient.putContext) return patient.putContext(domain, key, value);
        return null;
      },
      feedEnergy: function (energy, speechActive) {
        if (patient && patient.feedEnergy) patient.feedEnergy(energy, speechActive);
      },
      listening: function () {
        return lastListening || (patient ? patient.state() : null);
      },
      history: function () {
        return history.slice();
      },
      isBusy: function () {
        return busy;
      },
      isPatient: function () {
        return !!usePatient;
      },
      inject: handleUtterance, // text inject without mic
    };
  }

  return { create: create };
});
