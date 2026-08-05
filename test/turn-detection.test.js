"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Turn = require("../src/turn-detection");

describe("scenarios", () => {
  it("lists patient 1400ms", () => {
    const list = Turn.listScenarios();
    const p = list.find((s) => s.id === "patient");
    assert.ok(p);
    assert.equal(p.silence_ms, 1400);
  });
});

describe("semantic completeness", () => {
  it("ummm incomplete", () => {
    assert.equal(Turn.isLinguisticallyIncomplete("I want to ummm"), true);
  });
  it("trailing and incomplete", () => {
    assert.equal(Turn.isLinguisticallyIncomplete("I need a room and"), true);
  });
  it("thanks complete", () => {
    assert.equal(Turn.isLinguisticallyComplete("Thanks!"), true);
  });
  it("mid digits incomplete", () => {
    assert.equal(Turn.isLinguisticallyIncomplete("my number is 555"), true);
  });
});

describe("shouldEndTurn patient", () => {
  it("does not end on 900ms with incomplete", () => {
    const d = Turn.shouldEndTurn({
      transcript: "my flight is",
      silenceMs: 900,
      scenario: "patient",
      isFinal: false,
    });
    assert.equal(d.end, false);
    assert.ok(d.threshold_ms >= 1400);
  });
  it("ends on 1500ms silence", () => {
    const d = Turn.shouldEndTurn({
      transcript: "I need a room for tonight please.",
      silenceMs: 1500,
      scenario: "patient",
      isFinal: false,
    });
    assert.equal(d.end, true);
  });
  it("fast command lower threshold", () => {
    const d = Turn.shouldEndTurn({
      transcript: "book it",
      silenceMs: 350,
      scenario: "fast_command",
      isFinal: true,
    });
    assert.ok(d.threshold_ms <= 400);
  });
  it("stress raises threshold", () => {
    const base = Turn.adjustSilenceMs(1400, { stress: 0 });
    const stressed = Turn.adjustSilenceMs(1400, { stress: 1 });
    assert.ok(stressed > base);
  });
  it("speech_active blocks end", () => {
    const d = Turn.shouldEndTurn({
      transcript: "hello",
      silenceMs: 2000,
      scenario: "patient",
      speechActive: true,
    });
    assert.equal(d.end, false);
    assert.equal(d.reason, "speech_active");
  });
});

describe("barge-in", () => {
  it("medium barges on words", () => {
    const b = Turn.shouldBargeIn({ sensitivity: "medium", interim: "yes I" });
    assert.equal(b.barge, true);
  });
  it("low waits for more", () => {
    const b = Turn.shouldBargeIn({ sensitivity: "low", interim: "y", speechActive: true });
    assert.equal(b.barge, false);
  });
});

describe("context buffer", () => {
  it("stores cross-domain facts", () => {
    const buf = Turn.createContextBuffer();
    buf.put("hotel", "room", "1204");
    buf.put("transit", "shuttle_time", "3:30 pm");
    const snap = buf.snapshot();
    assert.equal(snap.hotel[0].value, "1204");
    assert.ok(buf.toPromptBlock().includes("hotel"));
  });
});

describe("turn machine", () => {
  it("configures scenario", () => {
    const m = Turn.createTurnMachine({ scenario: "dictation" });
    const st = m.configure({ stress: 0.5, expert: "airport_guide" });
    assert.ok(st.threshold_ms >= 1200);
  });
});
