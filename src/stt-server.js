/**
 * Server-transcription STT — the sovereign DEFAULT.
 *
 * Captures the mic with getUserMedia + MediaRecorder, segments utterances
 * client-side with energy VAD + patient turn-detection thresholds, then POSTs
 * each utterance to POST /v1/stt/transcribe where LOCAL faster-whisper
 * transcribes it ON THE SERVER MACHINE. No audio ever goes to a cloud
 * speech vendor.
 *
 * Fallback: browser Web Speech API (src/stt.js) — CLOUD: audio is sent to the
 * browser vendor's speech service (e.g. Google). Used only when
 *   · POCKET_VOICE_STT=webspeech is set (explicit opt-out of local ASR), or
 *   · the transcribe endpoint is network-unreachable (never on HTTP errors —
 *     a 503 means faster-whisper is missing and says so; we do NOT silently
 *     degrade to cloud in that case).
 *
 * Callback API mirrors src/stt.js: onFinal(text, meta), onInterim (not emitted
 * in server mode — finals only), onState(bool), onError(msg), onEngine(info).
 */
"use strict";

var Turn = null;
try {
  Turn = require("./turn-detection");
} catch (_) {
  Turn = null;
}

var WebSpeechSTT = null;
try {
  WebSpeechSTT = require("./stt");
} catch (_) {
  WebSpeechSTT = null;
}

var ENERGY_THRESHOLD = 0.035; // RMS, matches stt-pocket.js
var MIN_SPEECH_MS = 250; // ignore noise blips shorter than this
var MAX_UTTERANCE_MS = 30000; // safety cutoff per utterance

function env(name) {
  try {
    if (typeof process !== "undefined" && process.env && process.env[name]) return process.env[name];
  } catch (_) {}
  try {
    if (typeof window !== "undefined" && window[name]) return window[name];
  } catch (_) {}
  return "";
}

// Pure: which engine should be used? "server" (local Whisper) or "webspeech" (cloud).
function resolveEngine(opts) {
  opts = opts || {};
  var e = String(opts.engine || env("POCKET_VOICE_STT") || "server").toLowerCase();
  if (e === "webspeech" || e === "cloud" || e === "browser") return "webspeech";
  return "server";
}

// Pure: silence threshold (ms) for a turn-detection scenario name.
function scenarioSilenceMs(name) {
  var fallback = { fast_command: 300, standard: 650, patient: 1400, dictation: 2000 };
  try {
    if (Turn && Turn.listScenarios) {
      var list = Turn.listScenarios();
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === name && list[i].silence_ms) return list[i].silence_ms;
      }
    }
  } catch (_) {}
  return fallback[name] || fallback.standard;
}

function buildTranscribeUrl(opts) {
  opts = opts || {};
  return opts.transcribeUrl || opts.transcribe_url || "/v1/stt/transcribe";
}

function create(opts) {
  opts = opts || {};
  var engine = resolveEngine(opts);
  var lang = opts.lang || "en";
  var scenario = opts.scenario || "standard";
  var silenceMs = opts.silenceMs || scenarioSilenceMs(scenario);
  var transcribeUrl = buildTranscribeUrl(opts);
  var allowFallback = opts.fallback !== false;

  var onFinal = opts.onFinal || function () {};
  var onInterim = opts.onInterim || function () {};
  var onState = opts.onState || function () {};
  var onError = opts.onError || function () {};
  var onEngine = opts.onEngine || function () {};

  // Explicit cloud opt-out of local ASR: delegate to browser Web Speech.
  if (engine === "webspeech") {
    return createWebSpeechDelegate(opts, "explicit POCKET_VOICE_STT=webspeech (browser cloud STT)");
  }

  var isBrowser = typeof window !== "undefined" && !!(navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (!isBrowser) {
    return {
      start: function () { onError("server STT needs a browser mic (getUserMedia)"); return false; },
      stop: function () {},
      toggle: function () { return false; },
      isOn: function () { return false; },
      available: function () { return { server: false, webspeech: false }; },
      engine: function () { return "unavailable"; },
    };
  }

  var micOn = false;
  var stream = null;
  var audioCtx = null;
  var analyser = null;
  var energyTimer = null;
  var mediaRec = null;
  var chunks = [];
  var mimeType = "";
  var speechActive = false;
  var speechStartAt = 0;
  var lastSpeechAt = 0;
  var utteranceHasSpeech = false;
  var delegate = null; // webspeech delegate after network fallback
  var announced = false;

  function setOn(v) { micOn = !!v; onState(micOn); }

  function announce() {
    if (announced) return;
    announced = true;
    onEngine({
      engine: "server-local-whisper",
      label: "Local Whisper (on-device transcription — audio stays on the server host)",
      cloud: false,
      transcribeUrl: transcribeUrl,
      scenario: scenario,
      silence_ms: silenceMs,
    });
  }

  function createWebSpeechDelegate(o, reason) {
    if (!WebSpeechSTT) {
      onError("webspeech fallback unavailable: src/stt.js not loadable");
      return null;
    }
    var d = WebSpeechSTT.create({
      lang: o.lang,
      onFinal: function (t) { onFinal(t, { engine: "webspeech", cloud: true, note: "browser cloud STT" }); },
      onInterim: function (t) { onInterim(t, { engine: "webspeech", cloud: true }); },
      onState: onState,
      onError: onError,
    });
    onEngine({ engine: "webspeech", label: "Browser Web Speech (CLOUD — audio goes to the browser vendor)", cloud: true, reason: reason });
    return d;
  }

  function pickMime() {
    var candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    for (var i = 0; i < candidates.length; i++) {
      try {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
      } catch (_) {}
    }
    return "";
  }

  function stopAll() {
    if (energyTimer) { clearInterval(energyTimer); energyTimer = null; }
    // Hand mediaRec off BEFORE clearing: onstop fires async and
    // deliverUtterance() consumes chunks then. Clearing chunks here would
    // silently drop the trailing utterance on user stop().
    var rec = mediaRec;
    mediaRec = null;
    try { if (rec && rec.state !== "inactive") rec.stop(); } catch (_) {} // -> onstop -> deliverUtterance()
    try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
    stream = null;
    try { if (audioCtx) audioCtx.close(); } catch (_) {}
    audioCtx = null;
    analyser = null;
  }

  function postUtterance(blob) {
    var fd = new FormData();
    fd.append("audio", blob, "utterance." + (mimeType.indexOf("mp4") >= 0 ? "mp4" : "webm"));
    fd.append("lang", lang);
    return fetch(transcribeUrl, { method: "POST", body: fd }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j || j.ok === false) {
          var err = new Error((j && (j.error || j.hint)) || ("transcribe http " + r.status));
          err.httpStatus = r.status;
          err.detail = j;
          throw err;
        }
        return j;
      });
    });
  }

  function deliverUtterance() {
    // Called from mediaRec.onstop — chunks are fully flushed by then.
    mediaRec = null;
    if (!chunks.length || !utteranceHasSpeech) { chunks = []; utteranceHasSpeech = false; return; }
    var blob = new Blob(chunks, { type: mimeType || "audio/webm" });
    chunks = [];
    utteranceHasSpeech = false;
    postUtterance(blob).then(function (j) {
      var text = String((j && j.text) || "").trim();
      if (text) {
        onFinal(text, {
          engine: (j && j.engine) || "local-whisper",
          model: j && j.model,
          language: j && j.language,
          duration: j && j.duration,
          cloud: false,
          is_final: true,
        });
      }
    }).catch(function (e) {
      var netFail = !e.httpStatus; // network-level: server unreachable
      if (netFail && allowFallback && !delegate) {
        try { stopAll(); } catch (_) {}
        setOn(false);
        delegate = createWebSpeechDelegate(opts, "transcribe endpoint unreachable — fell back to browser cloud STT");
        if (delegate) {
          onError("server_stt_unreachable: falling back to browser Web Speech (CLOUD)");
          delegate.start();
          return;
        }
      }
      // HTTP errors (e.g. 503 faster-whisper missing) are reported honestly —
      // never silently degraded to cloud.
      onError("transcribe_failed: " + String((e && e.message) || e).slice(0, 200));
    });
  }

  function beginUtterance(s) {
    chunks = [];
    utteranceHasSpeech = false;
    speechStartAt = Date.now();
    try {
      mimeType = pickMime();
      mediaRec = mimeType ? new MediaRecorder(s, { mimeType: mimeType }) : new MediaRecorder(s);
      mediaRec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
      mediaRec.onstop = function () { deliverUtterance(); };
      mediaRec.start(250);
    } catch (e) {
      onError("recorder_failed: " + String((e && e.message) || e).slice(0, 160));
    }
  }

  function energyLoop() {
    if (!analyser) return;
    var data = new Uint8Array(analyser.fftSize);
    energyTimer = setInterval(function () {
      if (!analyser) return;
      analyser.getByteTimeDomainData(data);
      var sum = 0;
      for (var i = 0; i < data.length; i++) {
        var v = (data[i] - 128) / 128;
        sum += v * v;
      }
      var energy = Math.sqrt(sum / data.length);
      var now = Date.now();
      var was = speechActive;
      speechActive = energy > ENERGY_THRESHOLD;
      if (speechActive) {
        lastSpeechAt = now;
        if (!was) {
          // speech onset -> start a new utterance capture
          if (!mediaRec) beginUtterance(stream);
          utteranceHasSpeech = true;
        }
      }
      if (mediaRec && utteranceHasSpeech && mediaRec.state !== "inactive") {
        var spokeMs = now - speechStartAt;
        var silentMs = now - lastSpeechAt;
        if (spokeMs >= MIN_SPEECH_MS && silentMs >= silenceMs) {
          try { mediaRec.stop(); } catch (_) {} // -> onstop -> deliverUtterance()
        } else if (spokeMs >= MAX_UTTERANCE_MS) {
          try { mediaRec.stop(); } catch (_) {} // safety cutoff -> deliverUtterance()
        }
      }
    }, 50);
  }

  function start() {
    if (delegate) return Promise.resolve(delegate.start());
    if (micOn) return Promise.resolve(true);
    announce();
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function (s) {
      stream = s;
      setOn(true);
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.7;
      src.connect(analyser);
      lastSpeechAt = 0;
      energyLoop();
      return true;
    }).catch(function (e) {
      setOn(false);
      onError("mic_failed: " + String((e && e.message) || e).slice(0, 160));
      return false;
    });
  }

  function stop() {
    if (delegate) { try { delegate.stop(); } catch (_) {} delegate = null; }
    setOn(false);
    stopAll();
    speechActive = false;
  }

  return {
    start: start,
    stop: stop,
    toggle: function () { if (micOn || delegate) { stop(); return false; } start(); return true; },
    isOn: function () { return micOn; },
    available: function () {
      return {
        server: isBrowser,
        webspeech: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
        transcribeUrl: transcribeUrl,
      };
    },
    engine: function () { return delegate ? "webspeech" : "server-local-whisper"; },
  };
}

var api = {
  create: create,
  engines: ["server", "webspeech"],
  defaultEngine: "server",
  version: "1.0.0",
  schema: "pocket.stt.v1",
  // exported for tests
  resolveEngine: resolveEngine,
  scenarioSilenceMs: scenarioSilenceMs,
  buildTranscribeUrl: buildTranscribeUrl,
  ENERGY_THRESHOLD: ENERGY_THRESHOLD,
  MIN_SPEECH_MS: MIN_SPEECH_MS,
  MAX_UTTERANCE_MS: MAX_UTTERANCE_MS,
};

if (typeof module === "object" && module.exports) module.exports = api;
else if (typeof window !== "undefined") window.PocketVoiceSTTServer = api;
