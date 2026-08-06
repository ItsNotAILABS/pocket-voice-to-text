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
const { createEngine } = require("./engine");

module.exports = {
  version: "1.1.0",
  product: "Pocket Voice",
  Business,
  Personalities,
  Coding,
  Turn,
  Keys,
  Flows,
  STTPocket,
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
  shouldEndTurn: Turn.shouldEndTurn,
  shouldBargeIn: Turn.shouldBargeIn,
  createTurnMachine: Turn.createTurnMachine,
  createContextBuffer: Turn.createContextBuffer,
  buildFusionMetadata: Turn.buildFusionMetadata,
  extractEntities: Turn.extractEntities,
  FUSION_SCHEMA: Turn.FUSION_SCHEMA,
  FUSION_VERSION: Turn.FUSION_VERSION,
  listFlows: Flows.listFlows,
  matchFlow: Flows.matchFlow,
  advanceFlow: Flows.advance,
  STT_ENGINES: STTPocket.engines,
  STT_SCHEMA: STTPocket.schema,
};
