# Pocket Voice API — sellable reference

**Version:** 1.0.0  
**Default port:** `8790`  
**Repo:** https://github.com/ItsNotAILABS/pocket-voice-to-text

Open-source voice API you **own**. Position against closed SaaS (usage-priced, lock-in): self-host free, patient listening, multi-personality, hospitality context buffer.

---

## Quick start

```bash
npm start
# GET http://127.0.0.1:8790/v1
```

### Sell / lock mode

```bash
# PowerShell
$env:MASTER_KEY="super-secret-master"
$env:REQUIRE_API_KEY="1"
npm start

# Mint a customer key
curl -s http://127.0.0.1:8790/v1/keys -H "Authorization: Bearer super-secret-master" -H "Content-Type: application/json" -d "{\"name\":\"acme\",\"product\":\"business\"}"
# → { "api_key": "pv_…", "product": "business", ... }  (show once)
```

Customers send:

```http
X-API-Key: pv_…
```

---

## Products (price cards)

| Product | Monthly | RPM | Use |
|---------|---------|-----|-----|
| **free** | $0 self-host | 60 | Dev / open local |
| **builder** | $29 hosted* | 300 | Indie apps |
| **business** | $149 hosted* | 2000 | CS / hospitality |
| **enterprise** | Contact | high | On-prem / SSO |

\*Hosted prices are **your** SaaS cards when you run this API for customers. Self-host remains free under MIT.

`GET /v1/products`

---

## Patient listening (the moat)

| Scenario | Silence | Barge-in |
|----------|---------|----------|
| `fast_command` | 300 ms | high |
| `standard` | 650 ms | medium |
| `patient` | **1400 ms** | medium |
| `dictation` | 2000 ms | low |

**Hybrid turn detection**

1. Silence threshold (scenario + stress + expert)  
2. Semantic incomplete → wait (“ummm”, trailing “and”, mid-digits)  
3. Optional energy / Silero via `energy` / `speech_active` fields  

```bash
curl -s localhost:8790/v1/turn/decide -H "Content-Type: application/json" -d "{\"transcript\":\"my flight is\",\"silence_ms\":900,\"scenario\":\"patient\"}"
# → { "end": false, "reason": "semantic_incomplete", "threshold_ms": 1400, ... }
```

---

## Core endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness |
| GET | `/v1` | Catalog |
| GET | `/v1/products` | Pricing |
| GET | `/v1/scenarios` | VAD scenarios |
| GET | `/v1/experts` | Airport / hotel / … |
| GET | `/v1/modes` | Business modes |
| GET | `/v1/personalities` | Personalities |
| POST | `/v1/turn` | Full agent turn + context buffer + `fusion` metadata |
| POST | `/v1/turn/decide` | End-of-turn only (+ optional `fusion` vector) |
| POST | `/v1/fusion/metadata` | Build conversational Fusion input vector (emit only; Deep Fusion in POCKET) |
| POST | `/v1/barge-in` | Cancel TTS? |
| POST | `/v1/listening` | Set scenario/stress/expert |
| POST | `/v1/context` | Cross-domain buffer put |
| POST | `/v1/session` | Create session |
| POST | `/v1/greet` | Greeting |
| POST | `/v1/route` | Stateless CS route |
| POST | `/v1/coding/parse` | Coding voice commands |
| POST | `/v1/keys` | Mint key (master) |

### Turn with hospitality context

```json
POST /v1/turn
{
  "text": "When is my shuttle?",
  "session_id": "guest-42",
  "scenario": "patient",
  "expert": "transit_concierge",
  "stress": 0.6,
  "context": {
    "transit": { "shuttle_time": "3:30 pm" },
    "hotel": { "room": "1204", "check_in": "4:00 pm" }
  }
}
```

Response includes `reply`, `listening.threshold_ms`, `context_buffer`, `tts_hint`.

---

## vs closed voice SaaS

| | Closed funded voice APIs | Pocket Voice |
|--|--------------------------|--------------|
| Cost | $/minute | Self-host **$0** |
| Source | Proprietary | **MIT** |
| Patient VAD | Black box | **Configurable 200–2000ms + semantic** |
| Personalities | Prompt only | Built-in CS/sales/coder/… |
| Lock-in | High | Fork & own |
| Full-duplex telephony | Often included | You add (LiveKit/Twilio) |

Use Pocket Voice as the **control plane** (turns, patience, personas, buffer). Plug Deepgram/ElevenLabs/Silero for raw audio quality when you need it.

---

## Node SDK

```js
const PV = require("@itsnotailabs/pocket-voice"); // or ./src/node-entry

const eng = PV.createEngine({
  scenario: "patient",
  expert: "hotel_host",
  stress: 0.5,
  businessMode: "customer_service",
});
eng.putContext("hotel", "room", "1204");
const out = await eng.turn("I need help with my room");
console.log(out.reply, out.listening);
```

---

## Browser patient mic

See `demo-patient.html` + `src/stt-patient.js` (Web Speech + hybrid turn machine). Feed Silero energy later via `feedEnergy(level, speechActive)`.
