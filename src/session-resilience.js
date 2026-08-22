"use strict";

const crypto = require("crypto");

function now() {
  return new Date().toISOString();
}

function requestDigest(action, payload, scope = {}) {
  const stable = JSON.stringify({ action, payload, scope }, Object.keys({ action, payload, scope }).sort());
  return "sha256:" + crypto.createHash("sha256").update(stable).digest("hex");
}

function retryPolicy(options = {}) {
  const maxAttempts = Number(options.maxAttempts ?? 2);
  const initialMs = Number(options.initialMs ?? 250);
  const multiplier = Number(options.multiplier ?? 2);
  const maxMs = Number(options.maxMs ?? 4000);
  const retryableCodes = Array.from(options.retryableCodes || ["timeout", "provider_unavailable", "rate_limited"]);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) throw new Error("invalid_max_attempts");
  if (initialMs < 0 || maxMs < initialMs || multiplier < 1) throw new Error("invalid_backoff");
  return {
    schema: "nexus.retry-policy.v1",
    max_attempts: maxAttempts,
    backoff: { initial_ms: initialMs, multiplier, max_ms: maxMs },
    retryable_codes: retryableCodes,
    terminal_action: options.terminalAction || "handoff",
  };
}

function retryDecision(policy, { attempt, errorCode }) {
  const retryable = policy.retryable_codes.includes(errorCode) && attempt < policy.max_attempts;
  const rawDelay = policy.backoff.initial_ms * Math.pow(policy.backoff.multiplier, Math.max(0, attempt - 1));
  return {
    retry: retryable,
    delay_ms: retryable ? Math.min(policy.backoff.max_ms, Math.floor(rawDelay)) : 0,
    next_action: retryable ? "retry" : policy.terminal_action,
    attempt,
    error_code: errorCode,
  };
}

class ProviderCircuitBreaker {
  constructor(dependency, options = {}) {
    this.dependency = String(dependency);
    this.threshold = Number(options.threshold ?? 3);
    this.recoveryMs = Number(options.recoveryMs ?? 30000);
    this.state = "closed";
    this.failureCount = 0;
    this.openedAt = 0;
    this.updatedAt = Date.now();
  }

  recordSuccess() {
    this.state = "closed";
    this.failureCount = 0;
    this.openedAt = 0;
    this.updatedAt = Date.now();
  }

  recordFailure(at = Date.now()) {
    this.failureCount += 1;
    if (this.failureCount >= this.threshold) {
      this.state = "open";
      this.openedAt = at;
    }
    this.updatedAt = at;
  }

  allowRequest(at = Date.now()) {
    if (this.state === "closed" || this.state === "half_open") return true;
    if (this.state === "open" && at >= this.openedAt + this.recoveryMs) {
      this.state = "half_open";
      this.updatedAt = at;
      return true;
    }
    return false;
  }

  protocol() {
    return {
      schema: "nexus.circuit-breaker.v1",
      dependency: this.dependency,
      state: this.state,
      failure_count: this.failureCount,
      threshold: this.threshold,
      recovery_ms: this.recoveryMs,
      updated_at: new Date(this.updatedAt).toISOString(),
    };
  }
}

function idempotencyRecord({ key, action, payload, scope = {}, state = "pending", ttlMs = 86400000 }) {
  if (!key || String(key).length > 200) throw new Error("invalid_idempotency_key");
  if (!["pending", "succeeded", "failed"].includes(state)) throw new Error("invalid_idempotency_state");
  const created = Date.now();
  return {
    schema: "nexus.idempotency.v1",
    key: String(key),
    scope,
    request_digest: requestDigest(action, payload, scope),
    state,
    created_at: new Date(created).toISOString(),
    expires_at: new Date(created + ttlMs).toISOString(),
  };
}

function sessionJob({ jobId, requestId, action, status = "queued", progress = 0, resultRefs = [] }) {
  if (!["queued", "running", "succeeded", "failed", "cancelled", "waiting_approval"].includes(status)) throw new Error("invalid_job_status");
  const stamp = now();
  return {
    schema: "nexus.job.v1",
    job_id: jobId,
    request_id: requestId,
    component: "pocket-voice",
    action,
    status,
    progress: Math.max(0, Math.min(1, Number(progress))),
    result_refs: Array.from(resultRefs),
    created_at: stamp,
    updated_at: stamp,
  };
}

module.exports = {
  requestDigest,
  retryPolicy,
  retryDecision,
  ProviderCircuitBreaker,
  idempotencyRecord,
  sessionJob,
};
