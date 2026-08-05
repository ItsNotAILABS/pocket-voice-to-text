# Pocket Voice-to-Text

**Browser mic → text in a text field.** Continuous listening, click to stop.

This is a **side project** extracted from the [POCKET](https://github.com/ItsNotAILABS/pocket) desk app.  
POCKET remains the main product; this repo is the small, open-source speech-to-text piece you can drop into any site.

## Demo

Open `index.html` in **Chrome, Edge, or Safari** (needs Web Speech API).

Or serve locally:

```bash
npx serve .
# open http://localhost:3000
```

## Features

- Continuous listening until you click again  
- Interim + final transcripts  
- Appends into a textarea (chat-style)  
- Hard errors only for permission / no mic  
- Zero dependencies — pure HTML/JS  

## Use in your app

```html
<script src="voice-to-text.js"></script>
<script>
  const v = PocketVoice.create({
    onFinal: (text) => { input.value += (input.value ? ' ' : '') + text; },
    onState: (on) => { micBtn.classList.toggle('hot', on); },
  });
  micBtn.onclick = () => v.toggle();
</script>
```

## Browser support

| Browser | Support |
|---------|---------|
| Chrome / Edge | Best (`webkitSpeechRecognition`) |
| Safari | Supported on recent versions |
| Firefox | Limited / often unavailable |

Requires **user gesture** to start and usually **HTTPS** (or localhost).

## License

MIT — see [LICENSE](LICENSE).

## Relation to POCKET

POCKET’s desk uses the same pattern for the 🎙 button in the chat composer.  
This repo is intentionally **standalone** so others can reuse voice input without the full host.

Maintained as a side project; not the primary POCKET roadmap.
