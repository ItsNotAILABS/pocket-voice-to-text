/**
 * Continuous speech-to-text (Web Speech API).
 * Pocket Voice Stack — open source.
 *
 * HONEST PLACEMENT: this module is the CLOUD FALLBACK. The browser's
 * SpeechRecognition sends microphone audio to the browser vendor's speech
 * service (e.g. Google) for recognition. The sovereign default is
 * src/stt-server.js, which captures utterances and has them transcribed by
 * LOCAL faster-whisper on the server host — no audio leaves the machine.
 * Use this module only when local ASR is unavailable or when the operator
 * explicitly opts out with POCKET_VOICE_STT=webspeech.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else {
    root.PocketVoiceSTT = factory();
    root.PocketVoice = root.PocketVoice || factory(); // back-compat alias
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function create(opts) {
    opts = opts || {};
    var lang = opts.lang || "en-US";
    var onFinal = opts.onFinal || function () {};
    var onInterim = opts.onInterim || function () {};
    var onState = opts.onState || function () {};
    var onError = opts.onError || function () {};
    var continuous = opts.continuous !== false;

    var SR = null;
    try {
      SR = (typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;
    } catch (_) {}

    var micOn = false;
    var rec = null;
    var restartTimer = null;

    function available() {
      return !!SR;
    }

    function setOn(v) {
      micOn = !!v;
      onState(micOn);
    }

    function stop() {
      setOn(false);
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
      try {
        if (rec) rec.stop();
      } catch (_) {}
      rec = null;
    }

    function startRec() {
      if (!micOn || !SR) return;
      try {
        rec = new SR();
        rec.lang = lang;
        rec.interimResults = true;
        rec.continuous = continuous;

        rec.onresult = function (e) {
          var final = "";
          var interim = "";
          for (var i = e.resultIndex; i < e.results.length; i++) {
            var t = e.results[i][0].transcript;
            if (e.results[i].isFinal) final += t;
            else interim += t;
          }
          if (interim) onInterim(interim.trim());
          if (final) onFinal(final.trim());
        };

        rec.onerror = function (ev) {
          var hard = ["not-allowed", "service-not-allowed", "audio-capture", "network"];
          if (hard.indexOf(ev.error) >= 0) {
            setOn(false);
            onError(ev.error || "error");
          }
        };

        rec.onend = function () {
          if (micOn && continuous) {
            restartTimer = setTimeout(function () {
              try {
                if (micOn) startRec();
              } catch (_) {}
            }, 280);
          }
        };

        rec.start();
      } catch (err) {
        setOn(false);
        onError((err && err.message) || "start-failed");
      }
    }

    function start() {
      if (!SR) {
        onError("unsupported");
        return false;
      }
      if (micOn) return true;
      setOn(true);
      startRec();
      return true;
    }

    function toggle() {
      if (micOn) {
        stop();
        return false;
      }
      return start();
    }

    return {
      available: available,
      start: start,
      stop: stop,
      toggle: toggle,
      isOn: function () {
        return micOn;
      },
      setLang: function (l) {
        lang = l || lang;
      },
    };
  }

  return { create: create };
});
