# Pocket Voice DevBoard

Canonical product-development board for Pocket Voice and the Voice Agent Studio layer.

## Current direction

Pocket Voice remains the open control plane: patient turn-taking, VAD policy, personas, flows, context, STT scaffolding, API keys, products, and session logic.

Voice Agent Studio becomes the premium real-time interaction surface on top:

- native voice-to-voice sessions
- 60fps multi-style visualization
- code/context snapping
- voice + mindset matrix
- session telemetry and receipts
- transcript export
- Cloudflare edge deployment
- sellable API and SDK surface

## Now — v1.2 integration

- [x] Establish `pocket-voice-to-text` as canonical public repository
- [x] Preserve Pocket Voice patient-listening moat
- [x] Define Studio capability contract
- [x] Separate acoustic voice from cognitive mindset
- [x] Keep Realtime provider keys server-side
- [x] Add code-context snapping contract
- [ ] Add hosted Realtime session broker
- [ ] Add tenant/API-key usage ledger
- [ ] Add session receipt schema and storage
- [ ] Add browser Studio package under `studio/`
- [ ] Add Cloudflare Worker adapter
- [ ] Add TypeScript SDK
- [ ] Add Python SDK
- [ ] Add embeddable web component

## Commercial API track

### Product surfaces

1. **Pocket Voice Open Core** — self-hosted control plane.
2. **Pocket Voice Hosted API** — managed API keys, metering, quotas, logs.
3. **Voice Agent Studio** — end-user/browser product.
4. **Voice Session API** — developers create managed real-time sessions.
5. **Context Snap API** — inject editor/document/runtime state into an active session.
6. **Telemetry API** — latency, turn, interruption, and session-quality receipts.

### Planned endpoints

- `GET /v1/studio/capabilities`
- `POST /v1/studio/session`
- `POST /v1/studio/context-snap`
- `POST /v1/studio/session/:id/event`
- `GET /v1/studio/session/:id/receipt`
- `GET /v1/studio/voices`
- `GET /v1/studio/mindsets`

## Infrastructure track

- Cloudflare Worker deployment adapter
- D1 customer/session/usage ledger
- Durable Object per active real-time session when stateful coordination is required
- KV for public product/config metadata
- R2 for optional exported session artifacts
- rate-limit binding and abuse controls
- staging preview before production promotion
- Digital Twin certification before live deploy

## Research track

- patient VAD + semantic turn completion
- interruption policy under stress/noisy environments
- local VAD latency versus server-side detection
- context-snap cognitive-load experiments
- FFT visualization frame-time benchmarks
- end-to-end voice latency measurements by network class
- multi-persona task-performance tests

## Truth boundary

Do not publish benchmark claims unless reproduced by the current build and hardware/network test matrix. Keep architecture targets separate from measured production results.

## Release rule

Every production release must ship with:

- tests
- release manifest
- API contract
- operator/deployment instructions
- hash receipt
- benchmark receipt when performance claims are made
- explicit rollback path
