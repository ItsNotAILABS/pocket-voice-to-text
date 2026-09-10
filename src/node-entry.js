/**
 * Node-safe entry — sellable Voice API + library.
 */
"use strict";

const Business = require("./business");
const Personalities = require("./personalities");
const Coding = require("./coding-core");
const Turn = require("./turn-detection");
const Keys = require("./keys");
const Flows = require("./agent-flows");
const STTPocket = require("./stt-pocket");
const STTServer = require("./stt-server");
const Studio = require("./studio-contract");
const Ecosystem = require("./ecosystem-intelligence");
const Resilience = require("./session-resilience");
const VoiceState = require("./voice-state");
const Reality = require("./reality-envelope");
const WorkBridge = require("./work-bridge");
const { createEngine } = require("./engine");

module.exports = {
  version: "1.3.0",
  product: "Pocket Voice",
  corpus: "medina.corpus-architectura.v2@2.1.0",
  Business,
  Personalities,
  Coding,
  Turn,
  Keys,
  Flows,
  STTPocket,
  STTServer, // sovereign default: mic -> utterance -> local faster-whisper
  Studio,
  Ecosystem,
  Resilience,
  VoiceState,
  Reality,
  WorkBridge,
  createEngine,
  turn: function turn(text, opts) {
    return createEngine(opts).turn(text);
  },
  listModes: () => Business.listModes(),
  listPersonalities: () => Personalities.list(),
  listCommands: () => Coding.listCommands(),
  listScenarios: () => Turn.listScenarios(),
  listExperts: () => Turn.listExperts(),
  listProducts: () => Keys.listProducts(),
  listStudioMindsets: Studio.listMindsets,
  listStudioVisualizers: Studio.listVisualizers,
  getStudioCapabilities: Studio.capabilities,
  normalizeContextSnap: Studio.normalizeContextSnap,
  getEcosystemCapabilities: Ecosystem.capabilityDescriptor,
  validateSessionBudget: Ecosystem.validateSessionBudget,
  contextPackFromSnap: Ecosystem.contextPackFromSnap,
  chooseVoiceProvider: Ecosystem.providerDecision,
  buildVoiceTelemetry: Ecosystem.telemetry,
  buildVoiceHealth: Ecosystem.health,
  buildVoiceHandoff: Ecosystem.handoff,
  createVoiceRetryPolicy: Resilience.retryPolicy,
  voiceRetryDecision: Resilience.retryDecision,
  ProviderCircuitBreaker: Resilience.ProviderCircuitBreaker,
  buildVoiceIdempotency: Resilience.idempotencyRecord,
  buildVoiceJob: Resilience.sessionJob,
  createVoiceState: VoiceState.createVoiceState,
  validateVoiceState: VoiceState.validateVoiceState,
  updateVoiceConsent: VoiceState.updateConsent,
  planVoiceProsody: VoiceState.planProsody,
  compileRealityEnvelope: Reality.compile,
  validateRealityEnvelope: Reality.validate,
  updateRealityEnvelope: Reality.event,
  sealRealityEnvelope: Reality.seal,
  speakRealityState: Reality.speakState,
  isExecutableVoiceIntent: Reality.isExecutable,
  submitRealityEnvelope: WorkBridge.submit,
  voiceToWork: WorkBridge.compileAndSubmit,
  shouldEndTurn: Turn.shouldEndTurn,
  shouldBargeIn: Turn.shouldBargeIn,
  createTurnMachine: Turn.createTurnMachine,
  createContextBuffer: Turn.createContextBuffer,
  buildFusionMetadata: Turn.buildFusionMetadata,
  extractEntities: Turn.extractEntities,
  FUSION_SCHEMA: Turn.FUSION_SCHEMA,
  FUSION_VERSION: Turn.FUSION_VERSION,
  STUDIO_SCHEMA: Studio.SCHEMA,
  CONTEXT_SNAP_SCHEMA: Studio.CONTEXT_SNAP_SCHEMA,
  VOICE_STATE_SCHEMA: VoiceState.SCHEMA,
  REALITY_SCHEMA: Reality.SCHEMA,
  REALITY_RECEIPT_SCHEMA: Reality.RECEIPT_SCHEMA,
  listFlows: Flows.listFlows,
  matchFlow: Flows.matchFlow,
  advanceFlow: Flows.advance,
  STT_ENGINES: STTServer.engines, // sovereign default first: server (local Whisper), webspeech (cloud fallback)
  STT_ENGINE_DEFAULT: STTServer.defaultEngine,
  STT_LEGACY_ENGINES: STTPocket.engines,
  STT_SCHEMA: STTPocket.schema,
};
