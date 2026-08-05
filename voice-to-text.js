/**
 * Pocket Voice-to-Text — continuous Web Speech API helper.
 * Zero deps. Works in Chrome / Edge / Safari (where available).
 *
 * Usage:
 *   const v = PocketVoice.create({
 *     onFinal: (text) => {},
 *     onInterim: (text) => {},
 *     onState: (listening) => {},
 *     onError: (code) => {},
 *     lang: 'en-US',
 *   });
 *   v.toggle(); // or v.start() / v.stop()
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PocketVoice = factory();
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

    var SR = null;
    try {
      SR = window.SpeechRecognition || window.webkitSpeechRecognition;
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
        rec.continuous = true;

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
          var hard = [
            "not-allowed",
            "service-not-allowed",
            "audio-capture",
            "network",
          ];
          if (hard.indexOf(ev.error) >= 0) {
            setOn(false);
            onError(ev.error || "error");
          }
        };

        rec.onend = function () {
          // Browsers often stop after a phrase — keep listening if user wants ON
          if (micOn) {
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
    };
  }

  return { create: create };
});
