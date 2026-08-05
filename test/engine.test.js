"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createEngine } = require("../src/engine");

describe("createEngine turn", () => {
  it("rejects empty", async () => {
    const eng = createEngine();
    const r = await eng.turn("  ");
    assert.equal(r.ok, false);
  });
  it("customer service refund turn", async () => {
    const eng = createEngine({ businessMode: "customer_service" });
    const r = await eng.turn("I need a refund");
    assert.equal(r.ok, true);
    assert.ok(r.reply.length > 5);
    assert.equal(r.mode, "customer_service");
    assert.ok(r.personality.id);
    assert.ok(r.tts_hint.text);
  });
  it("keeps history", async () => {
    const eng = createEngine();
    await eng.turn("hello");
    await eng.turn("I need a refund");
    assert.ok(eng.history().length >= 4);
  });
  it("greet works", () => {
    const eng = createEngine({ personality: "sales" });
    const g = eng.greet();
    assert.equal(g.ok, true);
    assert.ok(g.reply.length > 2);
  });
  it("custom brain", async () => {
    const eng = createEngine({
      brain: async (text) => "CUSTOM:" + text.toUpperCase(),
    });
    const r = await eng.turn("ping");
    assert.equal(r.reply, "CUSTOM:PING");
    assert.equal(r.source, "brain");
  });
  it("brain failure falls back", async () => {
    const eng = createEngine({
      businessMode: "sales",
      brain: async () => {
        throw new Error("llm down");
      },
    });
    const r = await eng.turn("how much does it cost");
    assert.equal(r.ok, true);
    assert.equal(r.source, "business_fallback");
    assert.match(r.reply, /pricing|seat/i);
  });
  it("setBusinessMode switches personality", () => {
    const eng = createEngine();
    eng.setBusinessMode("sales");
    const st = eng.getState();
    assert.equal(st.businessMode, "sales");
  });
  it("codingParse on engine", () => {
    const eng = createEngine();
    const p = eng.codingParse("run the tests");
    assert.equal(p.cmd, "run_tests");
  });
});
