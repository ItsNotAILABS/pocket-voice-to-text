# Pocket Voice — Enterprise Integration Guide

Pocket Voice is designed to run as a voice/session control service behind an authenticated product plane.

## Recommended topology

```text
Browser / Mobile / Telephony
           |
           v
Pocket Voice API / Studio Gateway
 turn timing · realtime session broker · context snap
           |
           v
POCKET Host
 identity · org · entitlement · audit · routing
           |
           v
POCKET Agent / other execution services
```

## Hosted controls

For design-partner or enterprise evaluation, enforce:

- tenant-scoped API keys or service identities;
- explicit CORS allowlists;
- per-key/session rate limits and quotas;
- server-side provider secrets;
- request/session IDs propagated into logs and receipts;
- bounded context-snap and transcript payloads;
- retention/deletion policy when persistence is enabled;
- provider timeout/fallback policy;
- health and readiness probes;
- deployment rollback separate from stored-data recovery.

## Commercial value layers

The MIT runtime can remain open while a hosted product monetizes:

- managed realtime provider brokerage;
- tenant keys and quotas;
- usage metering;
- session receipts and analytics;
- organization policy;
- managed retention/export controls;
- SDKs and embeddable Studio components;
- support, observability and deployment management.

## Design-partner acceptance test

A controlled evaluation should verify authenticated session creation, invalid-key rejection, rate-limit behavior, origin rejection, provider-secret isolation, context-snap limits, cross-tenant denial, transcript retention policy, session termination, telemetry export, provider outage behavior, and receipt/request-ID correlation.
