# Security Policy — Pocket Voice Alpha

Pocket Voice handles microphones, transcripts, code/context snapshots, provider sessions, and customer API keys. Those surfaces require explicit boundaries even in Alpha.

## Secrets

- Keep upstream provider keys server-side.
- Never embed long-lived provider credentials in browser JavaScript, HTML, source maps, public repos, or exported transcripts.
- Hosted customer keys should be revocable, scoped, rate-limited, and stored as hashes where practical.
- Do not put secrets into session receipts, telemetry exports, context snaps, or error messages.

## Browser boundary

- Request microphone permission only after explicit user action.
- Treat microphone state, mute state, session state, and provider readiness as separate UI states.
- Restrict hosted CORS to approved origins when credentialed APIs are enabled.
- Use secure contexts (HTTPS or loopback development) for microphone/realtime features.
- Bound context-snap size and reject unsupported payload types.

## Session boundary

Every hosted session should preserve an explicit customer/key scope and request/session identifier. Session mutation must not allow one customer to inspect or modify another customer's context or usage.

## Data handling

Default open-source operation should avoid durable transcript/context persistence unless a deployment explicitly enables storage. Deployments that retain data must document retention, deletion, access and export behavior.

## Reporting vulnerabilities

Do not publish exploitable reports as public issues. Contact maintainers privately through the organization’s available security/contact channel with the affected version, reproduction, impact, prerequisites and minimal proof-of-concept.

## Alpha truth boundary

This project does not claim SOC 2, ISO 27001, HIPAA eligibility, PCI DSS, formal penetration testing, or third-party security certification. Those properties depend on the deployed service and independent evidence.
