"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createEngine } = require("../src/engine");

describe("engine patient + context", () => {
  it("default listening patient", async () => {
    const eng = createEngine({});
    const g = eng.greet();
    assert.ok(g.listening.threshold_ms >= 1200);
  });
  it("harvests hotel room into buffer", async () => {
    const eng = createEngine({ businessMode: "customer_service", expert: "hotel_host" });
    await eng.turn("My room is 1204 and I need help");
    const st = eng.getState();
    assert.ok(st.context_buffer.hotel);
    assert.equal(st.context_buffer.hotel[0].value, "1204");
  });
  it("waiting when require_end and incomplete silence", async () => {
    const eng = createEngine({ scenario: "patient" });
    const r = await eng.turn("my flight is", {
      silence_ms: 500,
      is_final: false,
      require_end: true,
    });
    assert.equal(r.waiting, true);
  });
  it("configureListening", () => {
    const eng = createEngine({});
    // non-travel expert so fast scenario is not forced up to 1200ms
    const st = eng.configureListening({ scenario: "fast_command", stress: 0, expert: "sales" });
    assert.ok(st.threshold_ms <= 500, "got " + st.threshold_ms);
  });
});
