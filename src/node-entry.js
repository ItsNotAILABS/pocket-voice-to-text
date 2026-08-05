/**
 * Node-safe entry — sellable Voice API + library.
 */
"use strict";

const Business = require("./business");
const Personalities = require("./personalities");
const Coding = require("./coding-core");
const Turn = require("./turn-detection");
const Keys = require("./keys");
const { createEngine } = require("./engine");

module.exports = {
  version: "1.0.0",
  product: "Pocket Voice",
  Business,
  Personalities,
  Coding,
  Turn,
  Keys,
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
};
