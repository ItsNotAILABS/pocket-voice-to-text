"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Voice = require("../src/node-entry");

describe("Pocket Voice session resilience", () => {
  it("builds a bounded retry policy", () => {
    const p = Voice.createVoiceRetryPolicy({ maxAttempts: 3, initialMs: 100, multiplier: 2, maxMs: 250 });
    assert.equal(p.schema, "nexus.retry-policy.v1");
    assert.equal(Voice.voiceRetryDecision(p, { attempt: 1, errorCode: "timeout" }).delay_ms, 100);
    assert.equal(Voice.voiceRetryDecision(p, { attempt: 2, errorCode: "timeout" }).delay_ms, 200);
    assert.equal(Voice.voiceRetryDecision(p, { attempt: 3, errorCode: "timeout" }).retry, false);
  });

  it("opens and half-opens a provider circuit", () => {
    const c = new Voice.ProviderCircuitBreaker("provider-x", { threshold: 2, recoveryMs: 100 });
    c.recordFailure(1000);
    assert.equal(c.state, "closed");
    c.recordFailure(1000);
    assert.equal(c.state, "open");
    assert.equal(c.allowRequest(1050), false);
    assert.equal(c.allowRequest(1101), true);
    assert.equal(c.state, "half_open");
    c.recordSuccess();
    assert.equal(c.state, "closed");
    assert.equal(c.protocol().schema, "nexus.circuit-breaker.v1");
  });

  it("creates scope-sensitive idempotency records", () => {
    const a = Voice.buildVoiceIdempotency({ key: "k1", action: "voice.session.create", payload: { voice: "ash" }, scope: { tenant_id: "t1" } });
    const b = Voice.buildVoiceIdempotency({ key: "k1", action: "voice.session.create", payload: { voice: "ash" }, scope: { tenant_id: "t2" } });
    assert.equal(a.schema, "nexus.idempotency.v1");
    assert.notEqual(a.request_digest, b.request_digest);
  });

  it("normalizes asynchronous voice jobs", () => {
    const job = Voice.buildVoiceJob({ jobId: "j1", requestId: "r1", action: "voice.session.create", status: "waiting_approval", progress: 0.2 });
    assert.equal(job.schema, "nexus.job.v1");
    assert.equal(job.component, "pocket-voice");
    assert.equal(job.status, "waiting_approval");
    assert.equal(job.progress, 0.2);
  });
});
