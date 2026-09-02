#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "deploy" / "cloudflare" / "voice-pocket-handoff.json"
WEB = ROOT / "web" / "voice-to-text-pocket" / "index.html"
SDK = ROOT / "sdk" / "pocket-voice-client.js"
OUT = ROOT / "dist" / "voice-pocket-handoff" / "validation-receipt.json"


def digest(value) -> str:
    return "sha256:" + hashlib.sha256(json.dumps(value, sort_keys=True).encode("utf-8")).hexdigest()


def main() -> int:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    web = WEB.read_text(encoding="utf-8")
    sdk = SDK.read_text(encoding="utf-8")
    checks = [
        {"check": "canonical_route", "ok": manifest.get("canonical_beta_url") == "https://beta.pocketnova.app/voice/"},
        {"check": "web_showcase", "ok": WEB.exists() and "Voice-to-Text Pocket" in web},
        {"check": "sdk_task_packet", "ok": "localTranscriptPacket" in sdk and "execution_status" in sdk},
        {"check": "operator_approval_rule", "ok": "operator approval" in json.dumps(manifest).lower()},
        {"check": "claude_cloud_prompt", "ok": "deployment_prompt_for_claude_or_cloud" in manifest},
    ]
    receipt = {
        "schema": "pocket.voice_handoff.validation_receipt.v1",
        "ok": all(c["ok"] for c in checks),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
        "artifacts": [str(MANIFEST.relative_to(ROOT)), str(WEB.relative_to(ROOT)), str(SDK.relative_to(ROOT))],
    }
    receipt["hash"] = digest(receipt)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0 if receipt["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
