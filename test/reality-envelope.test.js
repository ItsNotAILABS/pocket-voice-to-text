"use strict";

const assert = require("node:assert/strict");
const Reality = require("../src/reality-envelope");

{
  const e = Reality.compile("fix the tests and refactor the API", { project: "pocket" });
  assert.equal(e.schema, "pocket.voice-reality-envelope.v1");
  assert.equal(e.intent, "code");
  assert.equal(e.agent, "pocket-agent");
  assert.equal(e.scope.project, "pocket");
  assert.equal(Reality.validate(e).ok, true);
}

{
  const e = Reality.compile("deploy this application", { project: "pocket" });
  assert.equal(e.intent, "deploy");
  assert.equal(e.risk, "high");
  assert.equal(e.approval, "confirm");
  assert.match(Reality.speakState({ ...e, state: "awaiting_confirmation" }), /confirm/i);
}

{
  let e = Reality.compile("build an app", { project: "pocket" });
  e = Reality.event(e, "execution_started", { state: "executing" });
  e = Reality.event(e, "verification_started", { state: "verifying" });
  e = Reality.seal(e, "succeeded");
  assert.equal(e.receipt.schema, "pocket.voice-reality-receipt.v1");
  assert.match(e.receipt.digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(Reality.speakState(e), /succeeded/i);
}

assert.equal(Reality.isExecutable("make a website"), true);
assert.equal(Reality.isExecutable("what time is it"), false);
console.log("reality-envelope: PASS");
