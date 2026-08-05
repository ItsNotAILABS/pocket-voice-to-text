<p align="center">
  <img src="assets/logo.svg" width="96" height="96" alt="Pocket Voice logo"/>
</p>

<h1 align="center">Pocket Voice</h1>

<p align="center">
  <strong>Open-source voice stack for real products</strong><br/>
  Voice→Text · Text→Voice · Voice agents · Multi-personality · Business CS · Coding+voice · <strong>HTTP API</strong>
</p>

<p align="center">
  <a href="https://github.com/ItsNotAILABS/pocket-voice-to-text/actions"><img alt="tests" src="https://img.shields.io/badge/tests-passing-10a37f?style=flat-square"/></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"/></a>
  <a href="docs/API.md"><img alt="api" src="https://img.shields.io/badge/API-HTTP%20v1-34d399?style=flat-square"/></a>
  <a href="https://github.com/ItsNotAILABS/pocket"><img alt="pocket" src="https://img.shields.io/badge/main%20product-POCKET-0a7a5f?style=flat-square"/></a>
</p>

<p align="center">
  <img src="assets/banner.svg" width="100%" alt="Pocket Voice banner"/>
</p>

---

## Why this exists

Side project from **[POCKET](https://github.com/ItsNotAILABS/pocket)** — reusable so friends (and you) can build voice features without the full host.

| You want | Use |
|----------|-----|
| Mic → text in a webpage | `src/stt.js` / demos |
| Speak replies | `src/tts.js` |
| Full voice agent | `src/agent.js` + personalities |
| Customer service / sales / ops | `src/business.js` + **HTTP API** |
| Talk while coding | `src/coding.js` |
| Backend for friends | **`npm start`** → `http://127.0.0.1:8790` |

---

## 60-second start

```bash
git clone https://github.com/ItsNotAILABS/pocket-voice-to-text.git
cd pocket-voice-to-text
npm test          # all unit + API tests
npm start         # HTTP API on :8790
```

```bash
curl -s http://127.0.0.1:8790/v1/turn -H "Content-Type: application/json" -d "{\"text\":\"I need a refund\"}"
```

Browser demos:

```bash
npm run demo
# open http://localhost:5173
```

| Demo | File |
|------|------|
| Voice → text | [index.html](index.html) |
| Voice agent + personalities | [demo-voice-agent.html](demo-voice-agent.html) |
| Code + voice | [demo-coding.html](demo-coding.html) |
| Business modes | [demo-business.html](demo-business.html) |

---

## HTTP API (for friends)

Full docs: **[docs/API.md](docs/API.md)**

```text
GET  /health
GET  /v1                 catalog
GET  /v1/modes           business modes
GET  /v1/personalities
GET  /v1/commands        coding voice commands
POST /v1/session         create session
POST /v1/turn            { text, session_id?, business_mode? }
POST /v1/greet
POST /v1/route           stateless intent match
POST /v1/coding/parse
POST /v1/tts/hint
```

Lock for shared hosts:

```bash
API_KEY=your-friend-key npm start
# clients send: X-API-Key: your-friend-key
```

### Node library

```js
const PocketVoice = require("./src/node-entry");

const eng = PocketVoice.createEngine({ businessMode: "customer_service" });
const out = await eng.turn("The app is broken");
console.log(out.reply);
// → ask for product/page details…
```

---

## Modules

```
src/
  stt.js            continuous speech-to-text (browser)
  tts.js            text-to-speech + remote hook
  agent.js          voice agent loop
  personalities.js  support · sales · coder · executive · founder…
  business.js       customer_service · sales · reception · ops
  coding.js         dictate + commands while coding
  coding-core.js    pure parse (Node + tests)
  engine.js         server-side turn engine
  node-entry.js     package main for Node
  pocket-voice.js   browser facade
server/
  api.js            zero-dep HTTP API
```

---

## Architecture

```
Browser mic ──► STT ──► your UI / POCKET desk
                   │
Friends / bots ──► HTTP API ──► Engine (business + personality [+ optional brain])
                                      │
                                      └──► reply + tts_hint ──► TTS / speakers
```

- **Browser** owns real-time mic (Web Speech API)  
- **API** owns sessions, routing, business logic, coding parse  
- Plug an LLM with `engine.setBrain(async (text, ctx) => reply)` in-process  

---

## Personalities & business modes

**Personalities:** support · sales · reception · coder · executive · founder  

**Business:** customer_service · sales · reception · ops  

---

## Tests

```bash
npm test
```

Unit tests cover business routing, personalities, coding commands, engine turns, HTTP API, and module loads.

---

## Use with POCKET

1. Run API next to the host, or `require` `node-entry`  
2. Desk 🎙 can keep using browser STT; agent replies can call `/v1/turn`  
3. Main product stays [POCKET](https://github.com/ItsNotAILABS/pocket)  

---

## License

MIT © ItsNotAI Labs — see [LICENSE](LICENSE)

<p align="center">
  <sub>Built to ship · ItsNotAI Labs / Medina Tech Labs</sub>
</p>
