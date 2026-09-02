# Voice-to-Text Pocket Deploy Handoff

Canonical route:

```text
https://beta.pocketnova.app/voice/
```

## Give this to Claude / Cloud / Cloudflare deploy agent

```text
Deploy Voice-to-Text Pocket from ItsNotAILABS/pocket-voice-to-text.
Mount web/voice-to-text-pocket/index.html under https://beta.pocketnova.app/voice/.
Expose sdk/pocket-voice-client.js under the beta SDK path.
Wire POST /voice/transcribe to transcript receipt creation.
Wire POST /voice/task-packets to Agent Pocket task intake only after explicit operator approval.
Do not execute spoken commands directly. Convert speech to a task packet and receipt first.
Do not store raw secrets, payment credentials, private keys, seed phrases, raw card data, CVV/CVC, or customer exports in transcript payloads.
```

## Added files

```text
web/voice-to-text-pocket/index.html
sdk/pocket-voice-client.js
deploy/cloudflare/voice-pocket-handoff.json
scripts/validate_voice_pocket_handoff.py
```

## Validate

```bash
python scripts/validate_voice_pocket_handoff.py
```

Receipt:

```text
dist/voice-pocket-handoff/validation-receipt.json
```
