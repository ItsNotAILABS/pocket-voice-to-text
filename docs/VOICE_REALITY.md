# Pocket Voice Reality

Pocket Voice 1.3 turns speech into either conversation or executable work.

## Executable voice

Examples:

- "fix the failing tests and refactor the API"
- "build the landing page"
- "run the benchmark"
- "deploy this application"

The voice service compiles executable language into `pocket.voice-reality-envelope.v1` with request identity, project/session scope, action, agent, risk, approval state, acceptance criteria, events, artifacts and verification.

`src/work-bridge.js` submits approved envelopes to the POCKET Host `POST /v1/jobs` runtime. Code/build work maps to the coding swarm; deployment maps to Forge. The same job then uses POCKET's normal queue, worker, cancellation and session lifecycle.

High-impact deploy/publish/ship requests stop at `awaiting_confirmation`. They are not queued until the envelope is approved.

## Spoken lifecycle

Pocket Voice can speak the real execution state:

```text
compiled
awaiting_confirmation
queued
executing
verifying
succeeded | failed | cancelled
```

A completed operation can be sealed as `pocket.voice-reality-receipt.v1` with a SHA-256 digest over action/state/artifact/verification evidence.

## Library API

```js
const Voice = require('@itsnotailabs/pocket-voice');

const envelope = Voice.compileRealityEnvelope(
  'fix the tests and refactor the API',
  { project: 'pocket', workspace: '/workspace/pocket' }
);

const queued = await Voice.submitRealityEnvelope(envelope, {
  host: 'http://127.0.0.1:8765'
});

console.log(queued.speech);
```

Convenience form:

```js
await Voice.voiceToWork('build the app', {
  project: 'pocket',
  workspace: '/workspace/pocket'
});
```

## Verification

```bash
npm test
node --test test/reality-envelope.test.js
```

The diagnostic matrix runs the Reality Envelope and resilience contracts on Node 20 and Node 22.
