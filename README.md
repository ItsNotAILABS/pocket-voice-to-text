# Pocket Voice Stack

**Open-source voice building blocks for real products** — not a toy demo.

| Mode | What it is |
|------|------------|
| **Voice → Text** | Continuous mic → transcript (chat, notes, tickets) |
| **Text → Voice** | Speak replies (browser TTS or your API) |
| **Voice → Voice** | Listen → think → speak (full duplex loop) |
| **Voice agents** | Personas + tools that act on speech |
| **Code + voice** | Talk while you code — dictation + spoken status |
| **Business voice** | Customer service, multi-personality, real ops |

**Side project.** Main product is still [POCKET](https://github.com/ItsNotAILABS/pocket).  
POCKET can pull these modules when needed; this repo stays small and reusable.

---

## Quick start

```bash
npx serve .
# open http://localhost:3000
```

| Page | Purpose |
|------|---------|
| [`index.html`](index.html) | Voice → text demo |
| [`demo-voice-agent.html`](demo-voice-agent.html) | Voice agent + personalities |
| [`demo-coding.html`](demo-coding.html) | Code + talk at the same time |
| [`demo-business.html`](demo-business.html) | Customer service / business modes |

```html
<script src="src/pocket-voice.js"></script>
<script>
  const stack = PocketVoiceStack.create({
    personality: "support",
    onTranscript: (t) => console.log(t),
    onSpeak: (t) => console.log("TTS:", t),
  });
  stack.mic.toggle();
</script>
```

---

## Modules (`src/`)

| File | Role |
|------|------|
| `stt.js` | Speech-to-text (Web Speech API, continuous) |
| `tts.js` | Text-to-speech (speechSynthesis + optional API hook) |
| `agent.js` | Voice agent loop: hear → route → reply → speak |
| `personalities.js` | Multi-personality profiles (tone, scripts, tools) |
| `business.js` | Customer service, sales, reception, status lines |
| `coding.js` | Voice-while-coding helpers (dictate, status, hands free) |
| `pocket-voice.js` | Bundle + `PocketVoiceStack` facade |

Zero npm deps for browser demos. Optional backend TTS/LLM is pluggable.

---

## Real business uses

1. **Customer service desk** — greet, triage, FAQ, escalate with calm support personality  
2. **Reception / routing** — “who do you need?” → department handoff scripts  
3. **Sales concierge** — qualify, book, summarize next step  
4. **Internal ops** — hands-free status while working a ticket  
5. **Developer desk** — dictate requirements while IDE stays focused; hear build results  
6. **Multi-personality brand** — same stack, different voice brand (support vs sales vs founder)  
7. **Accessibility** — speak to navigate, hear summaries  

---

## Personalities (built-in)

| Id | Tone | Best for |
|----|------|----------|
| `support` | Calm, clear, patient | Customer service |
| `sales` | Warm, concise, next-step | Lead qualify |
| `coder` | Direct, technical | Pair programming voice |
| `reception` | Friendly, routing | Front desk |
| `executive` | Brief, decisive | Status / briefing |

Add your own in `personalities.js` or pass `customPersonalities` at create time.

---

## Voice ↔ code (same time)

Coding mode does **not** block the editor:

- **Dictate** into a buffer or active input  
- **Commands** like “summarize this error”, “run the tests” (you wire the tool)  
- **Spoken status** when a job finishes  
- Mic stays continuous until you click off  

This is the pattern POCKET can reuse for “talk while Codex/Grok run.”

---

## Architecture (simple)

```
Mic ──► STT ──► Agent (personality + tools) ──► reply text
                      │                              │
                      ▼                              ▼
                 your backend / LLM              TTS / speakers
```

- Browser-only path works offline for STT/TTS where the OS allows  
- For production quality voices, set `tts.speak = async (text) => yourApi(text)`  

---

## Use from POCKET

When POCKET needs voice:

1. Vendor or submodule this repo under `vendor/pocket-voice` **or** copy `src/`  
2. Wire desk 🎙 to `PocketVoiceStack` / `stt`  
3. Optional: agent personality for phone / support modes  

POCKET remains the host product; this stays the **voice technology** layer.

---

## Browser support

| Feature | Chrome/Edge | Safari | Firefox |
|---------|-------------|--------|---------|
| STT continuous | Strong | Good (recent) | Weak |
| TTS | Good | Good | Good |
| Needs | HTTPS or localhost + mic permission | same | same |

---

## License

MIT — see [LICENSE](LICENSE).

## Charter (this repo)

1. Stay small and open — reusable outside POCKET  
2. Prefer browser-native first; plug in paid voice APIs later  
3. Business and multi-personality are first-class, not afterthoughts  
4. Coding+voice is a supported mode, not a gimmick  
5. POCKET integration is optional consumption, not a monorepo force-merge  

---

**Org:** [ItsNotAILABS](https://github.com/ItsNotAILABS) · **Main product:** [pocket](https://github.com/ItsNotAILABS/pocket)
