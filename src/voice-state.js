"use strict";

const crypto = require("crypto");

const SCHEMA = "pocket.voice-state.v1";
const CONSENT_STATES = new Set(["denied", "session", "persistent", "revoked"]);
const ALLOWED_PRINCIPAL_TYPES = new Set(["human", "organization", "agent", "model", "device", "api-client", "runtime-cell"]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(canonical(value)).digest("hex");
}

function requireText(value, name, max = 200) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${name} is required`);
  if (text.length > max) throw new Error(`${name} exceeds ${max} characters`);
  return text;
}

function normalizePrincipal(value = {}) {
  const principalType = requireText(value.principal_type || value.type, "principal.principal_type", 40);
  if (!ALLOWED_PRINCIPAL_TYPES.has(principalType)) throw new Error(`unsupported principal type: ${principalType}`);
  return {
    schema: "nexus.identity-ref.v1",
    principal_id: requireText(value.principal_id || value.id, "principal.principal_id", 160),
    principal_type: principalType,
    tenant_id: requireText(value.tenant_id || value.tenant, "principal.tenant_id", 160),
    auth_context: String(value.auth_context || "session-reference-only").slice(0, 120),
  };
}

function normalizeConsent(value = {}) {
  const state = String(value.state || "denied").trim().toLowerCase();
  if (!CONSENT_STATES.has(state)) throw new Error(`unsupported consent state: ${state}`);
  const scopes = {
    capture: Boolean(value.capture),
    transcribe: Boolean(value.transcribe),
    synthesize: Boolean(value.synthesize),
    store_audio: Boolean(value.store_audio),
    adapt_voice: Boolean(value.adapt_voice),
    clone_speaker: Boolean(value.clone_speaker),
  };
  if (["denied", "revoked"].includes(state) && Object.values(scopes).some(Boolean)) {
    throw new Error(`${state} consent cannot enable voice scopes`);
  }
  if (scopes.adapt_voice && !scopes.store_audio) throw new Error("voice adaptation requires consent to store the adaptation source audio");
  if (scopes.clone_speaker && state !== "persistent") throw new Error("speaker cloning requires explicit persistent consent");
  if (scopes.clone_speaker && !scopes.adapt_voice) throw new Error("speaker cloning requires adapt_voice consent");
  return {
    state,
    scopes,
    granted_by: value.granted_by ? String(value.granted_by).slice(0, 160) : null,
    granted_at: value.granted_at || null,
    expires_at: value.expires_at || null,
    consent_receipt: value.consent_receipt || null,
  };
}

function normalizeInputState(value = {}) {
  return {
    mode: String(value.mode || "text").slice(0, 40),
    transcript_ref: value.transcript_ref || null,
    audio_ref: value.audio_ref || null,
    language: String(value.language || "und").slice(0, 24),
    vad: value.vad && typeof value.vad === "object" ? { ...value.vad } : {},
    stt: value.stt && typeof value.stt === "object" ? { ...value.stt } : {},
  };
}

function normalizeDialogueState(value = {}) {
  return {
    phase: String(value.phase || "listening").slice(0, 40),
    turn_id: value.turn_id ? String(value.turn_id).slice(0, 160) : null,
    silence_ms: Math.max(0, Number(value.silence_ms || 0)),
    incomplete: Boolean(value.incomplete),
    interruption: Boolean(value.interruption),
    context_refs: Array.isArray(value.context_refs) ? value.context_refs.map(String).slice(0, 32) : [],
  };
}

function normalizeOutputState(value = {}) {
  const metrics = value.metrics && typeof value.metrics === "object" ? { ...value.metrics } : {};
  const metricEvidence = Array.isArray(value.metric_evidence) ? value.metric_evidence.map(String).filter(Boolean) : [];
  const measuredClaims = ["time_to_first_audio_ms", "real_time_factor", "speaker_similarity", "emotion_score"]
    .filter((key) => metrics[key] !== undefined && metrics[key] !== null);
  if (measuredClaims.length && !metricEvidence.length) {
    throw new Error("measured voice claims require metric_evidence artifacts");
  }
  return {
    text_ref: value.text_ref || null,
    audio_ref: value.audio_ref || null,
    voice_id: value.voice_id ? String(value.voice_id).slice(0, 160) : null,
    prosody: value.prosody && typeof value.prosody === "object" ? { ...value.prosody } : {},
    metrics,
    metric_evidence: metricEvidence,
  };
}

function createVoiceState(input = {}) {
  const state = {
    schema: SCHEMA,
    session_id: requireText(input.session_id, "session_id", 160),
    principal: normalizePrincipal(input.principal),
    consent: normalizeConsent(input.consent),
    input_state: normalizeInputState(input.input_state),
    dialogue_state: normalizeDialogueState(input.dialogue_state),
    output_state: normalizeOutputState(input.output_state),
    observed_at: input.observed_at || new Date().toISOString(),
    claim_boundary: "voice state coordinates speech and dialogue; it is not the language model's hidden state or proof of expressive quality",
  };
  const errors = validateVoiceState(state);
  if (errors.length) throw new Error(errors.join("; "));
  return { ...state, state_sha256: sha256(state) };
}

function validateVoiceState(state = {}) {
  const errors = [];
  if (state.schema !== SCHEMA) errors.push(`schema must be ${SCHEMA}`);
  if (!state.session_id) errors.push("session_id is required");
  if (!state.principal || state.principal.schema !== "nexus.identity-ref.v1") errors.push("principal identity reference is required");
  if (!state.consent || !CONSENT_STATES.has(state.consent.state)) errors.push("valid consent is required");
  if (state.consent?.scopes?.clone_speaker && state.consent.state !== "persistent") errors.push("speaker cloning requires persistent consent");
  if (state.output_state?.metrics && Object.keys(state.output_state.metrics).length && !(state.output_state.metric_evidence || []).length) {
    errors.push("output metrics require evidence artifacts");
  }
  const serialized = JSON.stringify(state).toLowerCase();
  for (const forbidden of ["api_key", "authorization: bearer", "provider_secret", "password"]) {
    if (serialized.includes(forbidden)) errors.push(`voice state must not transport secret material: ${forbidden}`);
  }
  return errors;
}

function updateConsent(state, consent) {
  const next = { ...state, consent: normalizeConsent(consent), observed_at: new Date().toISOString() };
  delete next.state_sha256;
  const errors = validateVoiceState(next);
  if (errors.length) throw new Error(errors.join("; "));
  return { ...next, state_sha256: sha256(next) };
}

function planProsody(state, plan = {}) {
  const errors = validateVoiceState(state);
  if (errors.length) throw new Error(errors.join("; "));
  if (!state.consent.scopes.synthesize) throw new Error("speech synthesis requires synthesize consent");
  const payload = {
    schema: "pocket.voice-prosody-plan.v1",
    session_id: state.session_id,
    source_state_sha256: state.state_sha256 || sha256(state),
    pace: Math.max(0.5, Math.min(2.0, Number(plan.pace || 1.0))),
    warmth: Math.max(0, Math.min(1, Number(plan.warmth || 0.5))),
    emphasis: Array.isArray(plan.emphasis) ? plan.emphasis.map(String).slice(0, 32) : [],
    pauses: Array.isArray(plan.pauses) ? plan.pauses.slice(0, 64) : [],
    uncertainty_marking: Boolean(plan.uncertainty_marking),
    claim_boundary: "prosody plan is control metadata, not evidence of human preference or emotional fidelity",
  };
  return { ...payload, plan_sha256: sha256(payload) };
}

module.exports = {
  SCHEMA,
  EVIDENCE_BOUNDARY: "latency, similarity, emotion and naturalness claims require measured artifacts",
  createVoiceState,
  validateVoiceState,
  updateConsent,
  planProsody,
  normalizePrincipal,
  normalizeConsent,
  sha256,
};
