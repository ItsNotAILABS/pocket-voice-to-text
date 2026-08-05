/**
 * Text-to-speech — browser speechSynthesis + pluggable remote voice.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PocketVoiceTTS = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function create(opts) {
    opts = opts || {};
    var rate = opts.rate != null ? opts.rate : 1;
    var pitch = opts.pitch != null ? opts.pitch : 1;
    var volume = opts.volume != null ? opts.volume : 1;
    var voiceName = opts.voiceName || "";
    var lang = opts.lang || "en-US";
    /** Optional: async (text) => void — ElevenLabs, Azure, etc. */
    var remoteSpeak = typeof opts.remoteSpeak === "function" ? opts.remoteSpeak : null;
    var onStart = opts.onStart || function () {};
    var onEnd = opts.onEnd || function () {};
    var onError = opts.onError || function () {};
    var queue = [];
    var speaking = false;

    function available() {
      return !!(typeof window !== "undefined" && window.speechSynthesis) || !!remoteSpeak;
    }

    function pickVoice() {
      if (!window.speechSynthesis) return null;
      var voices = window.speechSynthesis.getVoices() || [];
      if (voiceName) {
        for (var i = 0; i < voices.length; i++) {
          if (voices[i].name.indexOf(voiceName) >= 0) return voices[i];
        }
      }
      for (var j = 0; j < voices.length; j++) {
        if ((voices[j].lang || "").indexOf(lang.slice(0, 2)) === 0) return voices[j];
      }
      return voices[0] || null;
    }

    function speakLocal(text) {
      return new Promise(function (resolve, reject) {
        if (!window.speechSynthesis) {
          reject(new Error("no-speechSynthesis"));
          return;
        }
        var u = new SpeechSynthesisUtterance(text);
        u.rate = rate;
        u.pitch = pitch;
        u.volume = volume;
        u.lang = lang;
        var v = pickVoice();
        if (v) u.voice = v;
        u.onstart = function () {
          speaking = true;
          onStart(text);
        };
        u.onend = function () {
          speaking = false;
          onEnd(text);
          resolve();
        };
        u.onerror = function (e) {
          speaking = false;
          onError((e && e.error) || "tts-error");
          reject(e);
        };
        window.speechSynthesis.speak(u);
      });
    }

    function speak(text) {
      text = String(text || "").trim();
      if (!text) return Promise.resolve();
      if (remoteSpeak) {
        speaking = true;
        onStart(text);
        return Promise.resolve(remoteSpeak(text))
          .then(function () {
            speaking = false;
            onEnd(text);
          })
          .catch(function (e) {
            speaking = false;
            onError((e && e.message) || "remote-tts");
            // fallback local
            return speakLocal(text);
          });
      }
      return speakLocal(text);
    }

    function speakQueued(text) {
      queue.push(text);
      function next() {
        if (!queue.length) return Promise.resolve();
        var t = queue.shift();
        return speak(t).then(next).catch(next);
      }
      if (!speaking) return next();
      return Promise.resolve();
    }

    function cancel() {
      queue = [];
      try {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
      } catch (_) {}
      speaking = false;
    }

    // Chrome loads voices async
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = function () {
          window.speechSynthesis.getVoices();
        };
      } catch (_) {}
    }

    return {
      available: available,
      speak: speak,
      speakQueued: speakQueued,
      cancel: cancel,
      isSpeaking: function () {
        return speaking;
      },
      setVoiceName: function (n) {
        voiceName = n || "";
      },
      setRate: function (r) {
        rate = r;
      },
      setRemoteSpeak: function (fn) {
        remoteSpeak = fn;
      },
    };
  }

  return { create: create };
});
