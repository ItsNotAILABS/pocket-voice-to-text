/**
 * Pocket-native STT — first-party speech engine abstraction.
 *
 * Engines (own stack, pluggable):
 *   · pocket   — MediaStream + energy VAD + optional host /v1/voice/stt
 *   · webspeech — browser SpeechRecognition (fallback)
 *   · hybrid   — pocket energy + webspeech transcript (default best UX)
 *
 * Design: you own the pipeline. Swap backends without rewriting agents.
 */
"use strict";

function create(opts) {
  opts = opts || {};
  var engine = (opts.engine || "hybrid").toLowerCase();
  var lang = opts.lang || "en-US";
  var hostStt = (opts.hostSttUrl || opts.host_stt_url || "").replace(/\/$/, "");
  var onFinal = opts.onFinal || function () {};
  var onInterim = opts.onInterim || function () {};
  var onState = opts.onState || function () {};
  var onError = opts.onError || function () {};
  var onEnergy = opts.onEnergy || function () {};
  var onEngine = opts.onEngine || function () {};

  var micOn = false;
  var stream = null;
  var audioCtx = null;
  var analyser = null;
  var energyTimer = null;
  var rec = null;
  var mediaRec = null;
  var chunks = [];
  var energy = 0;
  var speechActive = false;
  var lastSpeechAt = 0;
  var activeEngine = engine;

  function available() {
    if (typeof window === "undefined") return { pocket: false, webspeech: false, hybrid: false };
    var ws = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    var pocket = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    return { pocket: pocket, webspeech: ws, hybrid: pocket || ws, host: !!hostStt };
  }

  function setOn(v) {
    micOn = !!v;
    onState(micOn);
  }

  function stopEnergy() {
    if (energyTimer) {
      clearInterval(energyTimer);
      energyTimer = null;
    }
    try {
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    } catch (_) {}
    stream = null;
    try {
      if (audioCtx) audioCtx.close();
    } catch (_) {}
    audioCtx = null;
    analyser = null;
  }

  function startEnergy() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error("getUserMedia unavailable"));
    }
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function (s) {
      stream = s;
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.7;
      src.connect(analyser);
      var data = new Uint8Array(analyser.fftSize);
      energyTimer = setInterval(function () {
        if (!analyser) return;
        analyser.getByteTimeDomainData(data);
        var sum = 0;
        for (var i = 0; i < data.length; i++) {
          var v = (data[i] - 128) / 128;
          sum += v * v;
        }
        energy = Math.sqrt(sum / data.length);
        speechActive = energy > 0.035;
        if (speechActive) lastSpeechAt = Date.now();
        onEnergy({
          energy: Math.round(energy * 1000) / 1000,
          speech_active: speechActive,
          silence_ms: lastSpeechAt ? Date.now() - lastSpeechAt : 0,
          engine: activeEngine,
        });
      }, 50);
      return stream;
    });
  }

  function stopWebSpeech() {
    try {
      if (rec) rec.stop();
    } catch (_) {}
    rec = null;
  }

  function startWebSpeech() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return Promise.reject(new Error("webspeech unavailable"));
    return new Promise(function (resolve, reject) {
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
          if (interim) onInterim(interim.trim(), { engine: "webspeech", energy: energy, speech_active: speechActive });
          if (final) onFinal(final.trim(), { engine: "webspeech", energy: energy, speech_active: speechActive, is_final: true });
        };
        rec.onerror = function (ev) {
          var hard = ["not-allowed", "service-not-allowed", "audio-capture"];
          if (hard.indexOf(ev.error) >= 0) {
            setOn(false);
            onError(ev.error || "error");
          }
        };
        rec.onend = function () {
          if (micOn && (engine === "webspeech" || engine === "hybrid")) {
            try {
              rec.start();
            } catch (_) {}
          }
        };
        rec.start();
        resolve(true);
      } catch (e) {
        reject(e);
      }
    });
  }

  function stopMediaRec() {
    try {
      if (mediaRec && mediaRec.state !== "inactive") mediaRec.stop();
    } catch (_) {}
    mediaRec = null;
    chunks = [];
  }

  function startMediaRec(s) {
    if (typeof MediaRecorder === "undefined" || !s) return;
    try {
      chunks = [];
      mediaRec = new MediaRecorder(s);
      mediaRec.ondataavailable = function (ev) {
        if (ev.data && ev.data.size) chunks.push(ev.data);
      };
      mediaRec.onstop = function () {
        if (!chunks.length || !hostStt) return;
        var blob = new Blob(chunks, { type: mediaRec.mimeType || "audio/webm" });
        chunks = [];
        // Optional host STT — fire and forget; webspeech already provides text
        try {
          var fd = new FormData();
          fd.append("audio", blob, "utterance.webm");
          fd.append("lang", lang);
          fd.append("engine", "pocket");
          fetch(hostStt + "/v1/voice/stt", { method: "POST", body: fd }).then(function (r) {
            return r.json();
          }).then(function (j) {
            if (j && j.text && j.ok !== false) {
              onFinal(String(j.text).trim(), {
                engine: "pocket-host",
                energy: energy,
                speech_active: false,
                is_final: true,
                host: true,
              });
            }
          }).catch(function () {});
        } catch (_) {}
      };
      mediaRec.start(1200);
    } catch (_) {}
  }

  function start() {
    if (micOn) return Promise.resolve(true);
    setOn(true);
    activeEngine = engine;
    onEngine({ engine: activeEngine, available: available() });

    var chain = Promise.resolve();
    if (engine === "pocket" || engine === "hybrid") {
      chain = chain.then(function () {
        return startEnergy().then(function (s) {
          if (hostStt) startMediaRec(s);
          return s;
        });
      });
    }
    if (engine === "webspeech" || engine === "hybrid") {
      chain = chain.then(function () {
        return startWebSpeech().catch(function (e) {
          if (engine === "webspeech") throw e;
          // hybrid continues on energy-only if webspeech blocked
          activeEngine = "pocket";
          onEngine({ engine: activeEngine, note: "webspeech_fallback", error: String(e.message || e) });
        });
      });
    }
    return chain.catch(function (e) {
      setOn(false);
      onError(String(e.message || e));
      return false;
    });
  }

  function stop() {
    setOn(false);
    stopWebSpeech();
    stopMediaRec();
    stopEnergy();
  }

  function toggle() {
    if (micOn) {
      stop();
      return false;
    }
    start();
    return true;
  }

  function isOn() {
    return micOn;
  }

  function getEnergy() {
    return { energy: energy, speech_active: speechActive, engine: activeEngine };
  }

  function setEngine(name) {
    engine = String(name || "hybrid").toLowerCase();
    if (micOn) {
      stop();
      return start();
    }
    return Promise.resolve(true);
  }

  return {
    start: start,
    stop: stop,
    toggle: toggle,
    isOn: isOn,
    available: available,
    getEnergy: getEnergy,
    setEngine: setEngine,
    engine: function () {
      return activeEngine;
    },
  };
}

var api = {
  create: create,
  engines: ["hybrid", "pocket", "webspeech"],
  version: "1.1.0",
  schema: "pocket.stt.v1",
};

if (typeof module === "object" && module.exports) module.exports = api;
else if (typeof window !== "undefined") window.PocketVoiceSTTPocket = api;
