"use strict";

const Reality = require("./reality-envelope");

function normalizeHost(host) {
  return String(host || process.env.POCKET_HOST_URL || "http://127.0.0.1:8765").replace(/\/$/, "");
}

function jobBody(envelope) {
  const lane = envelope.model_lane || "";
  let mode = "agent";
  if (/codex/i.test(lane)) mode = "codex";
  else if (/claude/i.test(lane)) mode = "claude";
  else if (/grok/i.test(lane)) mode = "grok";
  else if (envelope.intent === "deploy") mode = "forge";
  else if (envelope.intent === "build" || envelope.intent === "code") mode = "coding_swarm";
  return {
    prompt: envelope.transcript,
    name: "voice-reality",
    mode,
    cwd: envelope.scope?.workspace || "",
    workspace: envelope.scope?.workspace || "",
    session_id: envelope.scope?.session || envelope.request_id,
    message_id: envelope.request_id,
    voice_reality: envelope,
  };
}

async function submit(envelope, opts = {}) {
  const validation = Reality.validate(envelope);
  if (!validation.ok) return { ok: false, error: "invalid_envelope", validation, envelope };
  if (envelope.risk === "high" && envelope.approval !== "approved") {
    const pending = Reality.event(envelope, "approval_required", { state: "awaiting_confirmation" });
    return { ok: true, queued: false, needs_confirmation: true, envelope: pending, speech: Reality.speakState(pending) };
  }

  const host = normalizeHost(opts.host);
  const headers = { "content-type": "application/json" };
  if (opts.token || process.env.POCKET_AUTH_TOKEN) {
    headers.authorization = `Bearer ${opts.token || process.env.POCKET_AUTH_TOKEN}`;
  }
  let response;
  try {
    response = await fetch(`${host}/v1/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify(jobBody(envelope)),
      signal: AbortSignal.timeout(Number(opts.timeoutMs || 8000)),
    });
  } catch (error) {
    const failed = Reality.event(envelope, "handoff_failed", { state: "failed", error: String(error.message || error) });
    return { ok: false, error: "pocket_host_unreachable", envelope: failed, speech: Reality.speakState(failed) };
  }

  let data = {};
  try { data = await response.json(); } catch (_) { data = { status: response.status }; }
  if (!response.ok) {
    const failed = Reality.event(envelope, "handoff_rejected", { state: "failed", http_status: response.status });
    return { ok: false, error: "pocket_host_rejected", response: data, envelope: failed, speech: Reality.speakState(failed) };
  }

  const queued = Reality.event(envelope, "job_queued", {
    state: "queued",
    job_id: data.id || data.job_id || data.job?.id || null,
  });
  return { ok: true, queued: true, job: data, envelope: queued, speech: `Queued ${envelope.action}. I will report execution and verification state from POCKET.` };
}

async function compileAndSubmit(text, opts = {}) {
  let envelope = Reality.compile(text, opts);
  if (opts.approved === true) envelope.approval = "approved";
  return submit(envelope, opts);
}

module.exports = { normalizeHost, jobBody, submit, compileAndSubmit };
