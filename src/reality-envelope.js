"use strict";

const crypto = require("node:crypto");

const SCHEMA = "pocket.voice-reality-envelope.v1";
const RECEIPT_SCHEMA = "pocket.voice-reality-receipt.v1";

function classify(text) {
  const low = String(text || "").toLowerCase();
  if (/\b(deploy|publish|ship|release)\b/.test(low)) {
    return { intent: "deploy", action: "deploy.plan", agent: "sovereign-forge-os", risk: "high" };
  }
  if (/\b(build|make|create|scaffold)\b/.test(low)) {
    return { intent: "build", action: "build.execute", agent: "pocket-agent", risk: "medium" };
  }
  if (/\b(code|fix|refactor|test|debug)\b/.test(low)) {
    return { intent: "code", action: "agent.run", agent: "pocket-agent", risk: "medium" };
  }
  if (/\b(research|investigate|find out)\b/.test(low)) {
    return { intent: "research", action: "research.skill.search", agent: "researchers-hub", risk: "low" };
  }
  if (/\b(benchmark|matrix|compute)\b/.test(low)) {
    return { intent: "compute", action: "compute.validate_matrices", agent: "matdaemon", risk: "low" };
  }
  return { intent: "assist", action: "voice.respond", agent: "pocket-voice", risk: "low" };
}

function compile(text, opts = {}) {
  const requestId = opts.requestId || `voice-${crypto.randomUUID()}`;
  const route = classify(text);
  return {
    schema: SCHEMA,
    request_id: requestId,
    origin: "voice",
    transcript: String(text || "").trim(),
    intent: route.intent,
    action: route.action,
    agent: route.agent,
    model_lane: opts.modelLane || null,
    scope: {
      tenant: opts.tenant || "",
      project: opts.project || "default",
      session: opts.session || requestId,
      workspace: opts.workspace || "",
    },
    risk: route.risk,
    approval: route.risk === "high" ? "confirm" : "allow",
    parameters: { prompt: String(text || "").trim(), ...(opts.parameters || {}) },
    acceptance: opts.acceptance || [
      "execution receipt exists",
      "artifacts are hashed when produced",
      "verification result is attached",
    ],
    state: "compiled",
    events: [{ type: "compiled", at: new Date().toISOString(), message: `voice compiled to ${route.action}` }],
    artifacts: [],
    verification: [],
    created_at: new Date().toISOString(),
  };
}

function validate(envelope) {
  const errors = [];
  if (!envelope || envelope.schema !== SCHEMA) errors.push("invalid_schema");
  if (!envelope?.request_id) errors.push("missing_request_id");
  if (!envelope?.transcript) errors.push("missing_transcript");
  if (!envelope?.scope?.project) errors.push("missing_project_scope");
  if (envelope?.risk === "high" && !["confirm", "approved"].includes(envelope.approval)) {
    errors.push("high_risk_requires_confirmation");
  }
  return { ok: errors.length === 0, errors };
}

function event(envelope, type, data = {}) {
  return {
    ...envelope,
    events: [...(envelope.events || []), { type, at: new Date().toISOString(), ...data }],
    state: data.state || envelope.state,
  };
}

function seal(envelope, status = envelope.state) {
  const base = {
    schema: envelope.schema,
    request_id: envelope.request_id,
    action: envelope.action,
    agent: envelope.agent,
    state: status,
    artifacts: envelope.artifacts || [],
    verification: envelope.verification || [],
  };
  const digest = `sha256:${crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex")}`;
  return {
    ...envelope,
    state: status,
    receipt: {
      schema: RECEIPT_SCHEMA,
      request_id: envelope.request_id,
      status,
      digest,
      sealed_at: new Date().toISOString(),
    },
  };
}

function speakState(envelope) {
  switch (envelope.state) {
    case "compiled":
      return `I compiled that into ${envelope.action} through ${envelope.agent}.`;
    case "awaiting_confirmation":
      return `The ${envelope.intent} operation is ready. Confirm and I will continue.`;
    case "executing":
      return `I am executing ${envelope.action} now.`;
    case "verifying":
      return "The work is complete and I am verifying the result.";
    case "succeeded":
      return `Done. ${envelope.action} succeeded and the execution receipt is sealed.`;
    case "failed":
      return "The operation failed. I kept the execution state so it can be repaired.";
    default:
      return `Execution state is ${envelope.state}.`;
  }
}

function isExecutable(text) {
  return /\b(code|build|make|create|fix|refactor|test|debug|deploy|publish|ship|release|benchmark)\b/i.test(String(text || ""));
}

module.exports = { SCHEMA, RECEIPT_SCHEMA, classify, compile, validate, event, seal, speakState, isExecutable };
