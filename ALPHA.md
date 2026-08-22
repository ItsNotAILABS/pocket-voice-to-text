# Pocket Voice Alpha

**Channel:** Alpha  
**Package:** `@itsnotailabs/pocket-voice` 1.2.x  
**Audience:** developers, design partners, voice-product teams, and controlled enterprise evaluations.

Pocket Voice is the conversational control plane of the POCKET family. It owns patient turn-taking, VAD/STT scaffolding, persona and flow logic, voice context, Studio contracts, context snapping, and voice-facing API primitives.

## Alpha principles

- Voice transport and cognitive policy are separate layers.
- Provider-specific realtime transports sit behind provider-neutral product contracts.
- Turn timing, context, session identity and telemetry remain inspectable.
- Browser clients never receive long-lived provider or platform secrets.
- Customer/API boundaries are versioned and rate-limited when hosted.
- Performance claims require measured evidence from the actual deployed path.

## Enterprise Alpha gates

| Area | Requirement |
|---|---|
| API | versioned public endpoints and bounded request bodies |
| Tenant | API key/customer scope preserved through session operations |
| CORS | explicit allowlist in hosted mode; no accidental wildcard credential surface |
| Secrets | upstream provider credentials remain server-side |
| Rate limits | per-key or per-tenant limits for hosted write/session routes |
| Context | snapped code/text is bounded, typed and attached to an explicit session |
| Privacy | transcripts/context are not persisted unless the deployment explicitly enables storage |
| Receipts | session/handshake/usage metadata is bounded and excludes hidden reasoning |
| Reliability | health/readiness distinguish process liveness from provider readiness |
| Compatibility | Studio and family contracts remain versioned/provider-neutral |
| Performance | latency/FPS claims include hardware, browser, network and sample methodology |

## Family role

```text
Voice client / Studio
        |
        v
Pocket Voice
turn timing · STT/VAD · personas · voice context
        |
        v
POCKET Host
identity · tenant · policy · routing
        |
        v
POCKET Agent
long-running execution · receipts
```

Pocket Voice does not own organization membership, enterprise identity, durable execution, or deployment approval.

## Alpha evidence levels

- `alpha-source` — APIs/contracts/source present.
- `alpha-ci` — Node test matrix and package smoke tests pass.
- `alpha-preview` — hosted preview with provider handshake evidence.
- `alpha-design-partner` — controlled tenant, rate-limit, audit and recovery tests pass.

## Known Alpha limits

- browser-native speech/realtime quality depends on provider, browser, device and network;
- local Web Speech capabilities vary substantially across browsers;
- self-hosted mode does not automatically provide enterprise identity or centralized audit retention;
- reported research latency and cognitive-load figures are not production claims without reproduced measurements;
- telephony/TURN/provider integrations may require additional infrastructure and commercial accounts.
