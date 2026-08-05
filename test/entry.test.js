"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const PocketVoice = require("../src/node-entry");

describe("node-entry package API", () => {
  it("exports version 1.x", () => {
    assert.match(PocketVoice.version, /^1\.\d+\.\d+$/);
  });
  it("turn helper", async () => {
    const r = await PocketVoice.turn("hello", { businessMode: "customer_service" });
    assert.equal(r.ok, true);
    assert.ok(r.reply);
  });
  it("listModes / personalities / commands / scenarios / products", () => {
    assert.ok(PocketVoice.listModes().length >= 4);
    assert.ok(PocketVoice.listPersonalities().length >= 5);
    assert.ok(PocketVoice.listCommands().length >= 5);
    assert.ok(PocketVoice.listScenarios().some((s) => s.id === "patient"));
    assert.ok(PocketVoice.listProducts().length >= 3);
  });
  it("createEngine", async () => {
    const eng = PocketVoice.createEngine({ businessMode: "ops" });
    const r = await eng.turn("status update please");
    assert.equal(r.ok, true);
  });
  it("shouldEndTurn export", () => {
    const d = PocketVoice.shouldEndTurn({
      transcript: "done.",
      silenceMs: 1600,
      scenario: "patient",
    });
    assert.equal(d.end, true);
  });
});
