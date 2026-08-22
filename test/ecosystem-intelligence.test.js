"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Voice = require("../src/node-entry");

describe("Pocket Voice ecosystem intelligence", () => {
  it("exports provider-neutral capabilities", () => {
    const c = Voice.getEcosystemCapabilities();
    assert.equal(c.schema, "nexus.capability.v1");
    assert.equal(c.component, "pocket-voice");
    assert.equal(c.limits.identity_authority, false);
    assert.equal(c.limits.long_running_execution, false);
  });

  it("enforces bounded session budgets", () => {
    const b = { limits: { max_turns: 3, max_duration_ms: 1000, max_context_bytes: 100, max_provider_calls: 3 } };
    assert.equal(Voice.validateSessionBudget(b, { turns: 2, duration_ms: 500, context_bytes: 50, provider_calls: 2 }).ok, true);
    const over = Voice.validateSessionBudget(b, { turns: 4, duration_ms: 500, context_bytes: 50, provider_calls: 2 });
    assert.equal(over.status, "budget_exhausted");
    assert.deepEqual(over.exceeded, ["turns"]);
  });

  it("turns code snaps into bounded context packs", () => {
    const p = Voice.contextPackFromSnap(
      { file: "x.js", language: "javascript", code: "const x = 1;" },
      { requestId: "r1", sessionId: "s1", tenantId: "t1", maxBytes: 1000 }
    );
    assert.equal(p.schema, "nexus.context-pack.v1");
    assert.equal(p.request_id, "r1");
    assert.equal(p.items[0].locator, "x.js");
    assert.equal(p.provenance.tenant_id, "t1");
  });

  it("chooses a ready provider and keeps alternatives", () => {
    const d = Voice.chooseVoiceProvider([
      { id: "slow", ready: true, realtime: true, audioOut: true, latencyMs: 500, costRank: 1 },
      { id: "fast", ready: true, realtime: true, audioOut: true, latencyMs: 80, costRank: 1 },
      { id: "down", ready: false, realtime: true },
    ], { realtime: true, audioOut: true });
    assert.equal(d.selected, "fast");
    assert.equal(d.degraded, false);
  });

  it("normalizes health and telemetry", () => {
    const h = Voice.buildVoiceHealth({ vad: "healthy", provider: "degraded" });
    assert.equal(h.status, "degraded");
    const t = Voice.buildVoiceTelemetry({ requestId: "r", rttMs: 120, fps: 60, provider: "native" });
    assert.equal(t.schema, "nexus.telemetry.v1");
    assert.equal(t.metrics.rtt_ms, 120);
  });

  it("creates explicit handoffs instead of executing long work", () => {
    const h = Voice.buildVoiceHandoff({ requestId: "r1", to: "pocket-agent", reason: "long-running coding task", artifacts: ["ctx1"] });
    assert.equal(h.schema, "nexus.handoff.v1");
    assert.equal(h.to, "pocket-agent");
  });
});
