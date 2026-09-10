#!/usr/bin/env python3
"""Local faster-whisper transcription helper for the Pocket Voice server.

Used by server/api.js `POST /v1/stt/transcribe` to transcribe utterance audio
ON THIS MACHINE. No audio leaves the host.

Usage:
    python3 server/stt-local.py <audio-file> [--model base] [--lang en]

Stdout: JSON {"ok": true, "text": ..., "language": ..., "duration": ..., "model": ...}
Exit codes:
    0  success (ok may still be false on transcription failure — see JSON)
    2  faster-whisper is not installed (caller should proxy to POCKET host)
    3  model failed to load/download
"""
import json
import os
import sys


def fail(code, error, hint=""):
    print(json.dumps({"ok": False, "error": error, "hint": hint}))
    sys.exit(code)


def main():
    if len(sys.argv) < 2:
        fail(1, "usage: stt-local.py <audio-file> [--model base] [--lang en]")
    audio = sys.argv[1]
    model_name = "base"
    lang = "en"
    args = sys.argv[2:]
    for i, a in enumerate(args):
        if a == "--model" and i + 1 < len(args):
            model_name = args[i + 1]
        if a == "--lang" and i + 1 < len(args):
            lang = args[i + 1]
    model_name = os.environ.get("POCKET_STT_MODEL") or model_name

    if not os.path.isfile(audio):
        fail(1, "audio_not_found")

    try:
        from faster_whisper import WhisperModel
    except Exception as e:
        fail(
            2,
            "faster-whisper not installed",
            "pip install faster-whisper, or run POCKET scripts/setup-sovereign-stt.sh; "
            "caller should proxy to the POCKET host instead. "
            f"({e})".strip()[:200],
        )

    device = os.environ.get("POCKET_STT_DEVICE") or "auto"
    compute = os.environ.get("POCKET_STT_COMPUTE_TYPE") or "int8"
    cache = os.path.join(os.path.expanduser("~"), ".pocket", "stt", "models")
    try:
        model = WhisperModel(model_name, device=device, compute_type=compute, download_root=cache)
    except Exception as e:
        fail(3, f"model '{model_name}' failed to load: {e}"[:300])

    try:
        segments, info = model.transcribe(audio, language=lang or "en", beam_size=5)
        text = " ".join(s.text.strip() for s in segments if s.text).strip()
        print(
            json.dumps(
                {
                    "ok": True,
                    "engine": "local-whisper",
                    "model": model_name,
                    "text": text[:8000],
                    "language": getattr(info, "language", lang),
                    "duration": round(getattr(info, "duration", 0.0), 2),
                    "own_stack": True,
                }
            )
        )
    except Exception as e:
        fail(1, f"transcribe_failed: {e}"[:300])


if __name__ == "__main__":
    main()
