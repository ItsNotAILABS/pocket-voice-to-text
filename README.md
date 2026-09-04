<p align="center">
  <img src="assets/logo.svg" width="96" height="96" alt="Pocket Voice"/>
</p>

<h1 align="center">Pocket Voice</h1>

<p align="center">
  <strong>Open voice control plane for patient turn-taking, STT, agent flows, Voice Studio and product APIs.</strong>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-1.2.0-10a37f?style=flat-square"/>
  <img alt="node" src="https://img.shields.io/badge/node-20%2B-339933?style=flat-square&logo=node.js&logoColor=white"/>
  <img alt="api" src="https://img.shields.io/badge/API-v1-2563eb?style=flat-square"/>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"/>
</p>

<p align="center"><img src="assets/banner.svg" width="100%" alt="Pocket Voice banner"/></p>

## What Pocket Voice is

Pocket Voice owns the **conversation control plane** in the POCKET ecosystem. It decides when a user is actually finished speaking, keeps structured voice context, routes personas/flows, exposes a sellable HTTP API, and provides a Voice Studio contract that can sit over different realtime/STT/TTS providers.

```text
Microphone / text / code context
            │
            ▼
      Pocket Voice
            │
            ├── patient end-of-turn
            ├── semantic incompleteness
            ├── VAD / STT engines
            ├── personas + business modes
            ├── agentic flows
            ├── context packs
            ├── session budgets
            ├── provider selection / failover
            └── health + telemetry + handoff
            │
            ▼
POCKET Host / POCKET Agent / application APIs
```

## Start locally

```bash
git clone https://github.com/ItsNotAILABS/pocket-voice-to-text.git
cd pocket-voice-to-text
npm install
npm test
npm start
```

API:

```text
http://127.0.0.1:8790
```

Useful surfaces:

- `terminal.html` — interactive API terminal
- `saas-dashboard.html` — keys, tiers and usage surface
- `demo-patient.html` — patient listening demo
- `demo-voice-agent.html` — voice-agent loop
- `demo-business.html` — business modes
- `demo-coding.html` — coding + voice

## Product capabilities

### Patient turn-taking

Pocket Voice does not equate silence with completion. The turn engine combines scenario timing with semantic incompleteness and optional signal state.

| Scenario | Typical silence window |
|---|---:|
| fast command / sales | 200–400 ms |
| standard | 500–800 ms |
| patient / travel / complex answers | 1000–1500 ms |
| dictation | 2000+ ms |

We open-sourced this so companies can **mess with real turn-taking** — not just consume a blob.

---

## Ecosystem (ItsNotAI Labs)

| Product | Repo | Role |
|---------|------|------|
| **POCKET host** | [ItsNotAILABS/pocket](https://github.com/ItsNotAILABS/pocket) | Desk · Aria · phone · fusion voice · `/v1/pocket-voice/*` proxy |
| **POCKET Agent** | [ItsNotAILABS/pocket-agent](https://github.com/ItsNotAILABS/pocket-agent) | Coding agent + install slices |
| **Pocket Voice** | **this repo** | Sovereign STT/TTS · patient VAD · multi-personality · agentic flows |
| **Electron / Edge** | pocket `desktop-electron` · `Open-POCKET-Edge` | Sovereign desk shells |
| **Phone Agent** | `pocket-phone-agent` | Agentic phone (`:8795`) via internal SDK → host API |

When the POCKET host is up, voice is same-origin proxied so the mic works in Edge app mode without CORS pain.

### Related host surfaces

| Surface | Path |
|---------|------|
| Aria / Voice desk agent | `/desk` mode `voice` |
| Voice Studio | `/studio/voice` |
| Phone Aria | `/phone` |
| Agent Mail | `/mail` · agents have their own inboxes |
| Docs | `/docs` |

```bash
curl -s http://127.0.0.1:8790/v1/turn/decide \
  -H 'content-type: application/json' \
  -d '{"transcript":"my flight is","silence_ms":900,"scenario":"patient"}'
```

### STT engines

```js
const PocketVoice = require("./src/node-entry");

console.log(PocketVoice.STT_ENGINES);
```

The open control layer supports browser/hybrid STT and a host bridge for additional ASR engines.

### Personas and business modes

Built-in product modes include customer service, sales, reception, operations, coder, executive and founder-oriented interaction patterns.

### Agentic flows

```bash
curl -s http://127.0.0.1:8790/v1/flows
```

Current flow families include:

```text
travel_recovery
code_pair
support_escalate
morning_brief
founder_sanctuary
```

### Voice Studio contract

The Node entrypoint exports provider-neutral Studio primitives:

```js
const PocketVoice = require("./src/node-entry");

PocketVoice.getStudioCapabilities();
PocketVoice.listStudioMindsets();
PocketVoice.listStudioVisualizers();
PocketVoice.normalizeContextSnap({
  filename: "src/app.ts",
  content: "export const ready = true;"
});
```

Context snaps can be normalized into bounded NEXUS context packs for a live voice session or handed to a long-running agent.

## Session intelligence

Pocket Voice now includes explicit runtime helpers for voice sessions rather than leaving reliability inside application glue.

```js
const PocketVoice = require("./src/node-entry");

PocketVoice.validateSessionBudget(/* session usage */);
PocketVoice.chooseVoiceProvider(/* provider candidates */);
PocketVoice.buildVoiceTelemetry(/* metrics */);
PocketVoice.buildVoiceHealth(/* dependency checks */);
PocketVoice.buildVoiceHandoff(/* next owner */);
```

The control plane supports:

- maximum turns per session;
- maximum session duration;
- maximum context bytes;
- maximum provider calls;
- provider readiness and capability scoring;
- alternate-provider selection;
- provider circuit breakers;
- bounded retry behavior;
- idempotent voice-session operations;
- normalized health and telemetry;
- explicit handoffs for work that belongs in POCKET Agent.

## API

Start the server:

```bash
npm start
```

Catalog:

```bash
curl -s http://127.0.0.1:8790/v1
```

Core routes include:

```text
GET  /v1
GET  /v1/products
GET  /v1/flows
POST /v1/flows/advance
POST /v1/turn
POST /v1/turn/decide
GET  /v1/stt/engines
POST /v1/stt/transcribe
```

The repository also includes keys, sessions, rate policy, SaaS-mode routes and Studio contracts. See [`docs/API.md`](docs/API.md).

### Example turn

```bash
curl -s http://127.0.0.1:8790/v1/turn \
  -H 'content-type: application/json' \
  -d '{
    "text":"When is hotel check-in?",
    "scenario":"patient",
    "expert":"hotel_host",
    "stress":0.5,
    "context":{"hotel":{"check_in":"4:00 pm","room":"1204"}}
  }'
```

## Customer API mode

Run the API with key enforcement:

```bash
REQUIRE_API_KEY=1 MASTER_KEY='replace-me' npm start
```

Mint a product key through the administrative key route documented in [`docs/API.md`](docs/API.md).

SaaS mode:

```bash
SAAS_MODE=1 \
MASTER_KEY='replace-me' \
REQUIRE_API_KEY=1 \
npm run saas
```

Optional Stripe configuration:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_PRO
STRIPE_PRICE_TEAM
FRONTEND_URL
```

## Node library

```js
const PocketVoice = require("pocket-voice-to-text");

const result = PocketVoice.turn("I need help with my hotel", {
  scenario: "patient"
});

console.log(result);
```

Exports include:

```text
Business
Personalities
Coding
Turn
Keys
Flows
STTPocket
Studio
Ecosystem
createEngine
```

## POCKET / NEXUS integration

```text
Pocket Voice
  conversational timing + voice context
        │
        ▼
POCKET Host
  identity + tenants + policy + routing
        │
        ▼
POCKET Agent
  long-running execution
        │
        ├── CAPSULA isolated runtime
        ├── MatDaemon compute
        └── Medina Memory durable outcomes
```

Pocket Voice produces/consumes ecosystem objects such as:

```text
pocket.context-snap.v1
nexus.context-pack.v1
nexus.health.v1
nexus.telemetry.v1
nexus.handoff.v1
nexus.job.v1
```

The repository-level declaration is [`ecosystem.surface.json`](ecosystem.surface.json).

## Production operating model

Recommended hosted topology:

```text
Browser/mobile client
      │
      ▼
TLS edge / API gateway
      │
      ├── tenant API key / identity
      ├── request + session rate policy
      └── request correlation
      │
      ▼
Pocket Voice
      │
      ├── turn engine
      ├── STT/provider adapters
      ├── Studio/context control
      └── usage + receipts
      │
      ▼
POCKET Host / agent handoff
```

For multi-tenant service operation, keep provider credentials server-side, enforce API keys on write routes, persist usage by tenant/key, and route long-running work through POCKET rather than holding an audio request open indefinitely.

## Verify

```bash
npm test
npm pack --dry-run
```

The repository CI exercises Node 20 and 22 plus package smoke checks.

## Repository map

```text
src/
├── node-entry.js
├── engine.js
├── turn-detection.js
├── stt-pocket.js
├── studio-contract.js
├── ecosystem-intelligence.js
├── resilience.js
├── agent-flows.js
├── business.js
├── personalities.js
└── keys.js

test/
docs/
assets/
ecosystem.surface.json
```

## Ecosystem

- [POCKET Host](https://github.com/ItsNotAILABS/pocket)
- [POCKET Agent](https://github.com/ItsNotAILABS/pocket-agent)
- [NEXUS](https://github.com/ItsNotAILABS/nexus)
- [PhoneAI](https://github.com/ItsNotAILABS/PhoneAI)

## License

MIT.
