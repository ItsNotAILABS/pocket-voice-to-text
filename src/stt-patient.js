/**
 * Patient STT wrapper — Web Speech API + hybrid turn detection.
 * Browser-first; Node tests cover turn-detection pure functions.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./stt"), require("./turn-detection"));
  } else {
    root.PocketVoicePatientSTT = factory(root.PocketVoiceSTT, root.PocketVoiceTurn);
  }
})(typeof self !== "undefined" ? self : this, function (STT, Turn) {
  "use strict";

  function create(opts) {
    opts = opts || {};
    var onTurn = opts.onTurn || function () {}; // final committed utterance
    var onPartial = opts.onPartial || function () {};
    var onState = opts.onState || function () {};
    var onError = opts.onError || function () {};
    var onBargeIn = opts.onBargeIn || function () {};

    var machine = Turn.createTurnMachine({
      scenario: opts.scenario || "patient",
      stress: opts.stress || 0,
      expert: opts.expert || "hotel_host",
      barge_in: opts.barge_in || "medium",
    });

    var partial = "";
    var committed = "";
    var pollTimer = null;

    var stt = STT.create({
      lang: opts.lang || "en-US",
      continuous: true,
      onFinal: function (text) {
        partial = (partial ? partial + " " : "") + text;
        machine.onTranscript(partial, false);
        onPartial(partial);
        var d = machine.decide(true);
        if (d.end) commitTurn("final");
      },
      onInterim: function (text) {
        var full = (committed ? committed + " " : "") + (partial ? partial + " " : "") + text;
        machine.onTranscript(full, false);
        onPartial(full);
        var b = machine.bargeCheck(text);
        if (b.barge) onBargeIn(b);
      },
      onState: onState,
      onError: onError,
    });

    function commitTurn(why) {
      var text = (partial || "").trim();
      if (!text) return;
      committed = text;
      onTurn(text, { reason: why, state: machine.state() });
      partial = "";
      machine.onTranscript("", false);
    }

    function startPoll() {
      if (pollTimer) return;
      pollTimer = setInterval(function () {
        if (!stt.isOn()) return;
        // No energy feed — approximate silence via time since last transcript event
        var d = machine.decide(false);
        if (d.end && partial.trim()) commitTurn(d.reason);
      }, 120);
    }

    function stopPoll() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    }

    return {
      mic: stt,
      machine: machine,
      start: function () {
        startPoll();
        return stt.start();
      },
      stop: function () {
        stopPoll();
        stt.stop();
      },
      toggle: function () {
        if (stt.isOn()) {
          this.stop();
          return false;
        }
        return this.start();
      },
      configure: function (cfg) {
        return machine.configure(cfg);
      },
      putContext: function (domain, key, value) {
        return machine.putContext(domain, key, value, "stt");
      },
      /** Feed external VAD (Silero etc.) energy 0..1 */
      feedEnergy: function (energy, speechActive) {
        machine.onAudio({ energy: energy, speechActive: speechActive });
      },
      state: function () {
        return machine.state();
      },
    };
  }

  return { create: create };
});
