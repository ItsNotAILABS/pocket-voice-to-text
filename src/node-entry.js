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
const Studio = require("./studio-contract");
const { createEngine } = require("./engine");

module.exports = {
  version: "1.2.0-dev",
  product: "Pocket Voice",
  Business,
  Personalities,
  Coding,
  Turn,
  Keys,
  Flows,
  STTPocket,
  Studio,
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
  listFlows: Flows.listFlows,
  matchFlow: Flows.matchFlow,
  advanceFlow: Flows.advance,
  STT_ENGINES: STTPocket.engines,
  STT_SCHEMA: STTPocket.schema,
};
