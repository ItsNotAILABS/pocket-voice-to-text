/**
 * Conversational Fusion metadata emitter (public voice stack).
 */
"use strict";

const assert = require("assert");
const Turn = require("../src/turn-detection");
const { createEngine } = require("../src/engine");

function testBuildFusionMetadata() {
  const meta = Turn.buildFusionMetadata({
    transcript: "my flight is delayed and I need the hotel to hold my room",
    stress: 0.62,
    expert: "airport_guide",
    scenario: "patient",
    silence_ms: 920,
    energy: 0.41,
    is_final: true,
    context_buffer: {
      airport: [{ key: "flight", value: "AA1234" }],
      hotel: [],
    },
    history_length: 4,
    session_id: "guest-42-dfw",
  });
  assert.strictEqual(meta.version, "1.0");
  assert.strictEqual(meta.schema, "pocket.voice.fusion_metadata.v1");
  assert.ok(meta.acoustic.stress >= 0.6);
  assert.ok(meta.linguistic.entities.length >= 2);
  assert.ok(meta.domain.candidate_experts.includes("hotel_host") || meta.domain.active_expert === "airport_guide");
  assert.strictEqual(meta.context_buffer.airport.flight, "AA1234");
  assert.ok(meta.session.user_state);
  console.log("ok buildFusionMetadata");
}

function testMachineGetFusionMetadata() {
  const m = Turn.createTurnMachine({ scenario: "patient", stress: 0.5, expert: "hotel_host" });
  m.putContext("airport", "flight", "AA99", "user");
  m.onTranscript("my flight is", false);
  const meta = m.getFusionMetadata({ history_length: 1 });
  assert.ok(meta.linguistic.incomplete);
  assert.ok(meta.context_buffer.airport.flight === "AA99");
  console.log("ok machine.getFusionMetadata");
}

async function testEngineTurnIncludesFusion() {
  const eng = createEngine({ scenario: "patient", stress: 0.55, expert: "airport_guide", personality: "aria" });
  const out = await eng.turn("my flight AA100 is delayed and I need a hotel");
  assert.ok(out.ok);
  assert.ok(out.fusion);
  assert.strictEqual(out.fusion.schema, "pocket.voice.fusion_metadata.v1");
  assert.ok((out.fusion.linguistic.entities || []).length >= 1);
  console.log("ok engine.turn fusion");
}

async function main() {
  testBuildFusionMetadata();
  testMachineGetFusionMetadata();
  await testEngineTurnIncludesFusion();
  console.log("all fusion metadata tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
