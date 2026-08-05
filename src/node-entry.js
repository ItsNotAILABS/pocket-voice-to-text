/**
 * Node-safe entry (no browser Speech APIs required).
 * For friends building backends / bots / POCKET host integration.
 */
"use strict";

const Business = require("./business");
const Personalities = require("./personalities");
const Coding = require("./coding-core");
const { createEngine } = require("./engine");

module.exports = {
  version: "0.3.0",
  Business,
  Personalities,
  Coding,
  createEngine,
  /** One-shot chat turn without mic */
  turn: function turn(text, opts) {
    return createEngine(opts).turn(text);
  },
  listModes: () => Business.listModes(),
  listPersonalities: () => Personalities.list(),
  listCommands: () => Coding.listCommands(),
};
