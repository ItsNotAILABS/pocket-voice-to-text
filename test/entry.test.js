"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const PocketVoice = require("../src/node-entry");

describe("node-entry package API", () => {
  it("exports version", () => {
    assert.match(PocketVoice.version, /^\d+\.\d+\.\d+$/);
  });
  it("turn helper", async () => {
    const r = await PocketVoice.turn("hello", { businessMode: "customer_service" });
    assert.equal(r.ok, true);
    assert.ok(r.reply);
  });
  it("listModes / listPersonalities / listCommands", () => {
    assert.ok(PocketVoice.listModes().length >= 4);
    assert.ok(PocketVoice.listPersonalities().length >= 5);
    assert.ok(PocketVoice.listCommands().length >= 5);
  });
  it("createEngine", async () => {
    const eng = PocketVoice.createEngine({ businessMode: "ops" });
    const r = await eng.turn("status update please");
    assert.equal(r.ok, true);
  });
});
