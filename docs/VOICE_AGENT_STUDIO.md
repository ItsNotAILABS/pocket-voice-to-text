# Voice Agent Studio

The Voice Agent Studio is the premium real-time interaction layer built on Pocket Voice.

## System split

### Pocket Voice control plane

Pocket Voice owns:

- patient listening and end-of-turn policy
- semantic turn completion
- business modes and personalities
- context buffer
- coding commands
- agentic flows
- STT scaffolding
- API keys, products, and rate policy

### Studio interaction plane

The Studio adds:

- native browser microphone/audio playback
- real-time voice-to-voice provider sessions
- five audio-reactive Canvas surfaces
- acoustic voice selection independent of mindset
- cognitive mindset selection independent of voice
- code/context snapping
- transcript panel and session export
- browser capability diagnostics
- session telemetry and quality receipts

## Studio capability contract

```json
{
  "schema": "pocket.voice.studio.capabilities.v1",
  "voices": ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"],
  "mindsets": ["strategic_partner", "senior_coding_architect", "founder_sanctuary"],
  "visualizers": ["quantum_core", "neural_synapse", "harmonic_waves", "digital_matrix", "zen_lotus"],
  "context_snap": true,
  "transcript_export": true,
  "telemetry": true
}
```

Voice identifiers are provider-dependent. Public Pocket Voice contracts should expose supported capabilities dynamically rather than hard-code vendor assumptions into client applications.

## Context Snap

A context snap is structured active-workspace state, not merely pasted text.

```json
{
  "schema": "pocket.voice.context_snap.v1",
  "source": "editor",
  "file": "src/app.js",
  "language": "javascript",
  "selection": {
    "start_line": 10,
    "end_line": 42,
    "start_column": 1,
    "end_column": 2
  },
  "content": "...",
  "metadata": {
    "workspace": "demo",
    "reason": "active_debug_context"
  }
}
```

The transport adapter may inject this into an active provider session, but Pocket Voice should retain the normalized schema so providers can be swapped.

## Realtime session boundary

Provider secrets stay server-side. Browser clients receive only short-lived session material or use a server-mediated SDP/session exchange.

Native WebRTC audio is negotiated through WebRTC; do not represent that lane as a fixed 16 kHz PCM uplink / 24 kHz PCM downlink unless using an explicit PCM gateway implementation.

## Visualization states

The Studio should render system state, not decoration alone:

- user speaking: emerald field/aura
- agent speaking: indigo rings/pulses
- listening idle: low-energy neutral state
- reconnecting: visible degraded/recovery state
- provider failure: explicit failure state

## Commercialization

Pocket Voice should sell the control surface rather than coupling customers to a single underlying voice vendor. Hosted editions can meter:

- session creation
- active session seconds/minutes
- context snaps
- transcript events
- storage/receipt retention
- premium orchestration features

Provider costs can be passed through or bundled by plan while Pocket Voice retains its independent turn/context/orchestration layer.
