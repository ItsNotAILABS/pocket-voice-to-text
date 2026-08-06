"use strict";
const assert = require("assert");
const Flows = require("../src/agent-flows");
const { createEngine } = require("../src/engine");

function testList() {
  const list = Flows.listFlows();
  assert.ok(list.length >= 4);
  console.log("ok listFlows", list.length);
}

function testMatch() {
  const f = Flows.matchFlow("my flight is delayed and I need the hotel");
  assert.ok(f && f.id === "travel_recovery");
  console.log("ok matchFlow travel");
}

function testAdvance() {
  let state = {};
  const a = Flows.advance(state, "flight delayed hotel please");
  assert.ok(a.active);
  assert.ok(a.coach);
  state = a.state;
  const b = Flows.advance(state, "ok hold the room");
  assert.ok(b.step_index >= 0);
  console.log("ok advance");
}

async function testEngineFlow() {
  const eng = createEngine({ scenario: "patient", stress: 0.5, expert: "airport_guide", personality: "aria" });
  const out = await eng.turn("my flight is delayed and I need the hotel to hold my room");
  assert.ok(out.ok);
  assert.ok(out.agentic_flow);
  assert.ok(out.stt && out.stt.own_stack);
  console.log("ok engine agentic_flow", out.agentic_flow && out.agentic_flow.flow_id);
}

async function main() {
  testList();
  testMatch();
  testAdvance();
  await testEngineFlow();
  console.log("all agent-flows tests passed");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
