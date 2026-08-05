/**
 * Back-compat: PocketVoice.create for STT (browser).
 * Prefer src/pocket-voice.js or src/node-entry.js for full stack / Node API.
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
      if (typeof window !== "undefined") {
        SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      }
    } catch (_) {}
    var micOn = false,
      rec = null,
      restartTimer = null;
    function setOn(v) {
      micOn = !!v;
      onState(micOn);
    }
    function stop() {
      setOn(false);
      if (restartTimer) clearTimeout(restartTimer);
      try {
        if (rec) rec.stop();
      } catch (_) {}
    }
    function startRec() {
      if (!micOn || !SR) return;
      try {
        rec = new SR();
        rec.lang = lang;
        rec.interimResults = true;
        rec.continuous = true;
        rec.onresult = function (e) {
          var final = "",
            interim = "";
          for (var i = e.resultIndex; i < e.results.length; i++) {
            var t = e.results[i][0].transcript;
            if (e.results[i].isFinal) final += t;
            else interim += t;
          }
          if (interim) onInterim(interim.trim());
          if (final) onFinal(final.trim());
        };
        rec.onerror = function (ev) {
          if (["not-allowed", "service-not-allowed", "audio-capture", "network"].indexOf(ev.error) >= 0) {
            setOn(false);
            onError(ev.error);
          }
        };
        rec.onend = function () {
          if (micOn)
            restartTimer = setTimeout(function () {
              try {
                if (micOn) startRec();
              } catch (_) {}
            }, 280);
        };
        rec.start();
      } catch (e) {
        setOn(false);
        onError((e && e.message) || "start-failed");
      }
    }
    return {
      available: function () {
        return !!SR;
      },
      start: function () {
        if (!SR) {
          onError("unsupported");
          return false;
        }
        if (micOn) return true;
        setOn(true);
        startRec();
        return true;
      },
      stop: stop,
      toggle: function () {
        if (micOn) {
          stop();
          return false;
        }
        return this.start();
      },
      isOn: function () {
        return micOn;
      },
    };
  }
  return { create: create };
});
