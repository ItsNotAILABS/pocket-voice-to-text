#!/usr/bin/env python3
"""Local turn-completion classifier for the Pocket Voice server.

Loads the trained pocket-voice-complete checkpoint (PyTorch, CPU) ON THIS
MACHINE and scores whether a transcript is a semantically complete utterance.
No data leaves the host.

Used by server/api.js `POST /v1/turn/complete` (and the opt-in semantic signal
in `POST /v1/turn/decide`).

Usage:
    python3 server/turn-local.py "turn on the kitchen lights" [--model-dir DIR]

Stdout: JSON {"ok": true, "complete": ..., "score": ..., "model": ..., "own_stack": true}
Exit codes:
    0  success (ok may still be false on inference failure -- see JSON)
    2  torch is not installed (caller should report 503 unavailable)
    3  model files missing (caller should report 503 unavailable)
"""
import json
import os
import sys


def fail(code, error, hint=""):
    print(json.dumps({"ok": False, "error": error, "hint": hint}))
    sys.exit(code)


def main():
    if len(sys.argv) < 2:
        fail(1, "usage: turn-local.py <transcript> [--model-dir DIR]")
    text = sys.argv[1]
    model_dir = ""
    args = sys.argv[2:]
    for i, a in enumerate(args):
        if a == "--model-dir" and i + 1 < len(args):
            model_dir = args[i + 1]
    if not model_dir:
        model_dir = os.environ.get("POCKET_TURN_MODEL_DIR") or ""
    if not model_dir:
        here = os.path.dirname(os.path.abspath(__file__))
        model_dir = os.path.join(
            os.path.dirname(here), "checkpoints", "pocket-voice-complete", "leg-3"
        )

    for fname in ("config.json", "pytorch_model.bin", "tokenizer.json", "inference.py"):
        if not os.path.isfile(os.path.join(model_dir, fname)):
            fail(
                3,
                f"model file missing: {fname}",
                f"expected trained checkpoint at {model_dir} "
                "(checkpoints/pocket-voice-complete/leg-3); "
                "override with POCKET_TURN_MODEL_DIR",
            )

    try:
        import torch  # noqa: F401
    except Exception as e:
        fail(
            2,
            "torch not installed",
            "pip install torch --index-url https://download.pytorch.org/whl/cpu; "
            f"({e})".strip()[:200],
        )

    device = os.environ.get("POCKET_TURN_DEVICE") or "cpu"
    try:
        sys.path.insert(0, model_dir)
        from inference import CompletenessPredictor

        predictor = CompletenessPredictor(model_dir, device=device)
    except Exception as e:
        fail(1, f"model_load_failed: {e}"[:300])

    try:
        r = predictor.predict(text)
        print(
            json.dumps(
                {
                    "ok": True,
                    "engine": "local-turn",
                    "model": "pocket-voice-complete-leg-3",
                    "complete": bool(r["complete"]),
                    "score": float(r["score"]),
                    "own_stack": True,
                }
            )
        )
    except Exception as e:
        fail(1, f"inference_failed: {e}"[:300])


if __name__ == "__main__":
    main()
