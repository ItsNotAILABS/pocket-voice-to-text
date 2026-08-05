"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("module load (UMD factories)", () => {
  it("loads stt factory", () => {
    const STT = require("../src/stt");
    assert.equal(typeof STT.create, "function");
    // no window SpeechRecognition in node — available() false but create works
    const inst = STT.create({ onError: () => {} });
    assert.equal(typeof inst.toggle, "function");
    assert.equal(inst.available(), false);
  });
  it("loads tts factory", () => {
    const TTS = require("../src/tts");
    assert.equal(typeof TTS.create, "function");
    const t = TTS.create({});
    assert.equal(typeof t.speak, "function");
  });
  it("loads personalities + business", () => {
    require("../src/personalities");
    require("../src/business");
    assert.ok(true);
  });
  it("loads coding with core", () => {
    // coding requires stt/tts — in node they still create
    const Coding = require("../src/coding");
    assert.equal(typeof Coding.parseCommand, "function");
    assert.equal(Coding.parseCommand("run the tests").cmd, "run_tests");
  });
  it("loads agent factory", () => {
    const Agent = require("../src/agent");
    assert.equal(typeof Agent.create, "function");
    const a = Agent.create({ speakReplies: false });
    assert.equal(typeof a.inject, "function");
  });
  it("loads pocket-voice facade", () => {
    const Stack = require("../src/pocket-voice");
    assert.equal(typeof Stack.create, "function");
    assert.ok(Stack.version);
  });
  it("loads voice-to-text back-compat", () => {
    const PV = require("../voice-to-text");
    assert.equal(typeof PV.create, "function");
  });
});
