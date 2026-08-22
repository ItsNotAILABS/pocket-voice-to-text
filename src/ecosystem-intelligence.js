"use strict";

const crypto = require("crypto");

const HEALTH_SCHEMA = "nexus.health.v1";
const TELEMETRY_SCHEMA = "nexus.telemetry.v1";
const CONTEXT_SCHEMA = "nexus.context-pack.v1";
const HANDOFF_SCHEMA = "nexus.handoff.v1";

function now() {
  return new Date().toISOString();
}

function capabilityDescriptor() {
  return {
    schema: "nexus.capability.v1",
    component: "pocket-voice",
    repository: "ItsNotAILABS/pocket-voice-to-text",
    role: "voice-conversation-control-plane",
    actions: [
      "voice.session.create",
      "voice.turn.decide",
      "voice.context.snap",
      "voice.transcript.scaffold",
      "voice.telemetry.report",
      "voice.handoff",
    ],
    produces: [CONTEXT_SCHEMA, TELEMETRY_SCHEMA, HEALTH_SCHEMA, HANDOFF_SCHEMA],
    consumes: ["nexus.task.v1", "nexus.budget.v1", "nexus.policy-decision.v1"],
    limits: {
      identity_authority: false,
      long_running_execution: false,
      hidden_reasoning_export: false,
      provider_credentials_in_browser: false,
    },
  };
}

function validateSessionBudget(budget, usage) {
  const limits = (budget && budget.limits) || {};
  const u = usage || {};
  const checks = {
    turns: [Number(u.turns || 0), Number(limits.max_turns || 0)],
    duration_ms: [Number(u.duration_ms || 0), Number(limits.max_duration_ms || 0)],
    context_bytes: [Number(u.context_bytes || 0), Number(limits.max_context_bytes || 0)],
    provider_calls: [Number(u.provider_calls || 0), Number(limits.max_provider_calls || 0)],
  };
  const missing = Object.entries(checks).filter(([, pair]) => pair[1] <= 0).map(([name]) => name);
  const exceeded = Object.entries(checks).filter(([, pair]) => pair[1] > 0 && pair[0] > pair[1]).map(([name]) => name);
  return {
    ok: missing.length === 0 && exceeded.length === 0,
    status: missing.length ? "invalid_budget" : exceeded.length ? "budget_exhausted" : "within_budget",
    missing,
    exceeded,
  };
}

function contextPackFromSnap(snap, meta = {}) {
  if (!snap || typeof snap !== "object") throw new TypeError("snap_must_be_object");
  if (typeof snap.code !== "string" || !snap.code.trim()) throw new Error("code_required");
  if (Buffer.byteLength(snap.code, "utf8") > Number(meta.maxBytes || 128 * 1024)) throw new Error("context_too_large");
  return {
    schema: CONTEXT_SCHEMA,
    request_id: meta.requestId || crypto.randomUUID(),
    items: [
      {
        type: "code-selection",
        locator: snap.file || snap.filename || "active-buffer",
        language: snap.language || "text",
        content: snap.code,
        selection: snap.selectionRange || snap.selection || null,
        sensitivity: meta.sensitivity || "internal",
        retention: meta.retention || "session",
        relevance_reason: meta.reason || "user context snap",
      },
    ],
    provenance: {
      component: "pocket-voice",
      session_id: meta.sessionId || null,
      tenant_id: meta.tenantId || null,
      captured_at: now(),
    },
  };
}

function providerDecision(providers, requirements = {}) {
  const candidates = (providers || [])
    .filter((p) => p && p.ready !== false)
    .map((p) => {
      let score = 0;
      if (requirements.realtime && p.realtime) score += 4;
      if (requirements.audioOut && p.audioOut) score += 2;
      if (requirements.local && p.local) score += 3;
      if (Number.isFinite(p.latencyMs)) score += Math.max(0, 3 - p.latencyMs / 500);
      if (Number.isFinite(p.costRank)) score += Math.max(0, 2 - p.costRank);
      return { ...p, score: Number(score.toFixed(3)) };
    })
    .sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
  return {
    selected: candidates[0] ? candidates[0].id : null,
    alternatives: candidates.slice(0, 3).map((p) => ({ id: p.id, score: p.score })),
    degraded: !candidates.length,
  };
}

function telemetry({ requestId, sessionId, rttMs, fps, inputLevel, outputLevel, provider }) {
  const metrics = {};
  if (Number.isFinite(rttMs)) metrics.rtt_ms = rttMs;
  if (Number.isFinite(fps)) metrics.fps = fps;
  if (Number.isFinite(inputLevel)) metrics.input_level = inputLevel;
  if (Number.isFinite(outputLevel)) metrics.output_level = outputLevel;
  if (provider) metrics.provider = String(provider);
  return {
    schema: TELEMETRY_SCHEMA,
    component: "pocket-voice",
    request_id: requestId || null,
    session_id: sessionId || null,
    metrics,
    observed_at: now(),
  };
}

function health(checks) {
  const entries = Object.entries(checks || {});
  const notReady = entries.filter(([, s]) => ["not_ready", "unavailable"].includes(s)).map(([k]) => k);
  const degraded = entries.filter(([, s]) => s === "degraded").map(([k]) => k);
  return {
    schema: HEALTH_SCHEMA,
    component: "pocket-voice",
    status: notReady.length ? "not_ready" : degraded.length ? "degraded" : "healthy",
    checks: Object.fromEntries(entries),
    not_ready: notReady,
    degraded,
    observed_at: now(),
  };
}

function handoff({ requestId, to, reason, artifacts = [], contextPackId = null }) {
  if (!requestId || !to || !reason) throw new Error("request_id_to_reason_required");
  return {
    schema: HANDOFF_SCHEMA,
    request_id: requestId,
    from: "pocket-voice",
    to,
    reason,
    artifacts: Array.from(artifacts),
    context_pack_id: contextPackId,
    created_at: now(),
  };
}

module.exports = {
  capabilityDescriptor,
  validateSessionBudget,
  contextPackFromSnap,
  providerDecision,
  telemetry,
  health,
  handoff,
};
