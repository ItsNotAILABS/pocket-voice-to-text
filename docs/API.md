# Pocket Voice HTTP API

For friends and builders. Zero npm dependencies. Node 18+.

## Start

```bash
cd pocket-voice-to-text
npm start
# http://127.0.0.1:8790
```

Optional lock:

```bash
# Windows PowerShell
$env:API_KEY="friend-secret"; $env:PORT="8790"; npm start
```

```bash
# bash
API_KEY=friend-secret PORT=8790 npm start
```

Send `X-API-Key: friend-secret` or `Authorization: Bearer friend-secret` when `API_KEY` is set.

---

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | no | Liveness |
| GET | `/v1` | no | Catalog + examples |
| GET | `/v1/modes` | no | Business modes |
| GET | `/v1/personalities` | no | Personalities |
| GET | `/v1/commands` | no | Coding voice commands |
| POST | `/v1/session` | yes* | Create session |
| POST | `/v1/turn` | yes* | Chat turn (stateful) |
| POST | `/v1/greet` | yes* | Spoken greeting text |
| POST | `/v1/route` | yes* | Stateless intent route |
| POST | `/v1/coding/parse` | yes* | Parse coding utterance |
| POST | `/v1/tts/hint` | yes* | TTS payload for client |
| GET | `/v1/session/:id` | yes* | Session state + history |
| DELETE | `/v1/session/:id` | yes* | Drop session |

\* If `API_KEY` is unset, mutating routes are open (fine for localhost friends).

---

## Examples

### One-shot business route

```bash
curl -s http://127.0.0.1:8790/v1/route ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"I need a refund\",\"mode\":\"customer_service\"}"
```

### Session + turn (customer service)

```bash
curl -s http://127.0.0.1:8790/v1/session -H "Content-Type: application/json" -d "{\"business_mode\":\"sales\"}"
# → { "session_id": "..." }

curl -s http://127.0.0.1:8790/v1/turn -H "Content-Type: application/json" ^
  -d "{\"session_id\":\"YOUR_ID\",\"text\":\"How much does it cost?\"}"
```

### Coding command parse

```bash
curl -s http://127.0.0.1:8790/v1/coding/parse -H "Content-Type: application/json" ^
  -d "{\"text\":\"run the tests\"}"
```

### JavaScript (browser or Node)

```js
const r = await fetch("http://127.0.0.1:8790/v1/turn", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    // "X-API-Key": "friend-secret",
  },
  body: JSON.stringify({
    text: "hello",
    business_mode: "customer_service",
    session_id: "friend-1",
  }),
});
const j = await r.json();
console.log(j.reply, j.tts_hint);
// Play j.tts_hint.text with speechSynthesis or your TTS vendor
```

### Node library (no HTTP)

```js
const PocketVoice = require("@itsnotailabs/pocket-voice");
// or: require("./src/node-entry")

const eng = PocketVoice.createEngine({ businessMode: "support" });
const out = await eng.turn("The app is broken");
console.log(out.reply);
```

---

## Response shape (`/v1/turn`)

```json
{
  "ok": true,
  "reply": "…",
  "matched": true,
  "source": "business",
  "mode": "customer_service",
  "personality": { "id": "support", "name": "Support", "style": "…" },
  "session_id": "…",
  "tts_hint": { "text": "…", "rate": 0.95 },
  "history_len": 2
}
```

Plug `tts_hint` into the browser TTS module (`src/tts.js`) or a paid voice API.

---

## Production notes

1. Set `API_KEY` when exposing beyond localhost  
2. Put behind HTTPS reverse proxy  
3. Optional: set `brain` only in process (not via public HTTP) for LLM replies  
4. Browser STT still runs **on the client**; this API is for **routing, agents, sessions**

---

**Repo:** https://github.com/ItsNotAILABS/pocket-voice-to-text
