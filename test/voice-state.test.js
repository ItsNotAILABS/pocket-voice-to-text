"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const VoiceState = require("../src/voice-state");

function base(overrides = {}) {
  return {
    session_id: "session-voice-1",
    principal: {
      principal_id: "user-1",
      principal_type: "human",
      tenant_id: "org-1",
      auth_context: "session-ref",
    },
    consent: {
      state: "session",
      capture: true,
      transcribe: true,
      synthesize: true,
      store_audio: false,
      adapt_voice: false,
      clone_speaker: false,
      granted_by: "user-1",
    },
    input_state: { mode: "audio", language: "en" },
    dialogue_state: { phase: "listening", turn_id: "turn-1", silence_ms: 0 },
    output_state: {},
    ...overrides,
  };
}

test("creates deterministic contract-shaped voice state", () => {
  const state = VoiceState.createVoiceState(base({ observed_at: "2026-08-24T00:00:00Z" }));
  assert.equal(state.schema, "pocket.voice-state.v1");
  assert.equal(state.principal.schema, "nexus.identity-ref.v1");
  assert.equal(state.consent.scopes.synthesize, true);
  assert.equal(state.state_sha256.length, 64);
  assert.deepEqual(VoiceState.validateVoiceState(state), []);
});

test("denied consent cannot enable capture or synthesis", () => {
  assert.throws(() => VoiceState.createVoiceState(base({
    consent: { state: "denied", capture: true, synthesize: true },
  })), /denied consent/);
});

test("speaker cloning requires explicit persistent adaptation consent", () => {
  assert.throws(() => VoiceState.createVoiceState(base({
    consent: {
      state: "session",
      capture: true,
      transcribe: true,
      synthesize: true,
      store_audio: true,
      adapt_voice: true,
      clone_speaker: true,
    },
  })), /persistent consent/);
});

test("voice quality and latency metrics require artifact references", () => {
  assert.throws(() => VoiceState.createVoiceState(base({
    output_state: { metrics: { time_to_first_audio_ms: 110 } },
  })), /metric_evidence/);
  const state = VoiceState.createVoiceState(base({
    observed_at: "2026-08-24T00:00:00Z",
    output_state: {
      metrics: { time_to_first_audio_ms: 110 },
      metric_evidence: ["artifact:latency-run-1"],
    },
  }));
  assert.deepEqual(state.output_state.metric_evidence, ["artifact:latency-run-1"]);
});

test("prosody plan requires synthesis consent and stays a control object", () => {
  const state = VoiceState.createVoiceState(base({ observed_at: "2026-08-24T00:00:00Z" }));
  const plan = VoiceState.planProsody(state, { pace: 0.9, warmth: 0.8, uncertainty_marking: true });
  assert.equal(plan.schema, "pocket.voice-prosody-plan.v1");
  assert.equal(plan.pace, 0.9);
  assert.match(plan.claim_boundary, /not evidence/);
});
