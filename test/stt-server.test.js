"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const STTServer = require("../src/stt-server");

describe("stt-server engine resolution (sovereign default)", () => {
  it("defaults to server (local Whisper), never webspeech", () => {
    assert.equal(STTServer.resolveEngine({}), "server");
    assert.equal(STTServer.defaultEngine, "server");
    assert.deepEqual(STTServer.engines[0], "server");
  });

  it("honors explicit webspeech opt-out", () => {
    assert.equal(STTServer.resolveEngine({ engine: "webspeech" }), "webspeech");
    assert.equal(STTServer.resolveEngine({ engine: "WEBSPEECH" }), "webspeech");
  });

  it("honors POCKET_VOICE_STT env opt-out", () => {
    const prev = process.env.POCKET_VOICE_STT;
    process.env.POCKET_VOICE_STT = "webspeech";
    try {
      assert.equal(STTServer.resolveEngine({}), "webspeech");
    } finally {
      if (prev === undefined) delete process.env.POCKET_VOICE_STT;
      else process.env.POCKET_VOICE_STT = prev;
    }
  });

  it("explicit engine opt beats env", () => {
    const prev = process.env.POCKET_VOICE_STT;
    process.env.POCKET_VOICE_STT = "webspeech";
    try {
      assert.equal(STTServer.resolveEngine({ engine: "server" }), "server");
    } finally {
      if (prev === undefined) delete process.env.POCKET_VOICE_STT;
      else process.env.POCKET_VOICE_STT = prev;
    }
  });
});

describe("stt-server turn segmentation config", () => {
  it("uses patient turn-detection scenario thresholds", () => {
    assert.equal(STTServer.scenarioSilenceMs("fast_command"), 300);
    assert.equal(STTServer.scenarioSilenceMs("standard"), 650);
    assert.equal(STTServer.scenarioSilenceMs("patient"), 1400);
    assert.equal(STTServer.scenarioSilenceMs("dictation"), 2000);
    assert.equal(STTServer.scenarioSilenceMs("nope"), 650); // unknown -> standard
  });

  it("exposes sane VAD constants", () => {
    assert.ok(STTServer.ENERGY_THRESHOLD > 0 && STTServer.ENERGY_THRESHOLD < 0.2);
    assert.ok(STTServer.MIN_SPEECH_MS >= 100);
    assert.ok(STTServer.MAX_UTTERANCE_MS >= 5000);
  });

  it("builds the transcribe URL with override", () => {
    assert.equal(STTServer.buildTranscribeUrl({}), "/v1/stt/transcribe");
    assert.equal(
      STTServer.buildTranscribeUrl({ transcribeUrl: "http://127.0.0.1:8790/v1/stt/transcribe" }),
      "http://127.0.0.1:8790/v1/stt/transcribe"
    );
  });
});

describe("stt-server in Node (no browser mic)", () => {
  it("create() degrades honestly without getUserMedia", () => {
    const errors = [];
    const s = STTServer.create({ onError: (m) => errors.push(m) });
    assert.equal(s.start(), false);
    assert.ok(errors.length > 0);
    assert.match(errors[0], /browser mic|getUserMedia/i);
    assert.equal(s.engine(), "unavailable");
  });

  it("delegates to webspeech module when explicitly opted out", () => {
    const seen = [];
    const s = STTServer.create({
      engine: "webspeech",
      onEngine: (info) => seen.push(info),
    });
    // src/stt.js create() works headless until start(); delegation must exist
    assert.ok(s && typeof s.start === "function");
    assert.ok(seen.some((i) => i.engine === "webspeech" && i.cloud === true));
  });
});
