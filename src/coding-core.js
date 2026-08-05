/**
 * Pure coding voice helpers (Node + browser). No Speech APIs.
 */
"use strict";

const COMMANDS = [
  { id: "mic_off", match: /^(stop listening|mic off)$/i, example: "stop listening" },
  { id: "read_selection", match: /^(read that|read selection|speak selection)$/i, example: "read selection" },
  { id: "summarize", match: /^(summarize|summary)$/i, example: "summarize" },
  { id: "run_tests", match: /^(run tests|run the tests)$/i, example: "run the tests" },
  { id: "new_file", match: /^(new file|create file)\s+(.+)/i, example: "new file app.js" },
  { id: "search", match: /^(search for|find)\s+(.+)/i, example: "search for TODO" },
  { id: "explain", match: /^(explain this|what does this do)$/i, example: "explain this" },
];

function parseCommand(text) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, type: "empty" };
  for (let i = 0; i < COMMANDS.length; i++) {
    const m = raw.match(COMMANDS[i].match);
    if (m) {
      return {
        ok: true,
        type: "command",
        cmd: COMMANDS[i].id,
        args: m.slice(1),
        raw,
        example: COMMANDS[i].example,
      };
    }
  }
  return { ok: true, type: "dictate", text: raw };
}

function listCommands() {
  return COMMANDS.map((c) => ({ id: c.id, example: c.example }));
}

/** Merge dictate chunks for editor buffer */
function appendDictate(buffer, text) {
  const b = String(buffer || "");
  const t = String(text || "").trim();
  if (!t) return b;
  if (!b) return t;
  const needSpace = !/[\s\n]$/.test(b);
  return b + (needSpace ? " " : "") + t;
}

function announceJobMessage(result) {
  if (typeof result === "string") return result.slice(0, 200);
  if (result && result.ok) return result.message || "Job finished successfully.";
  if (result && result.message) return String(result.message).slice(0, 200);
  return "Job finished with issues.";
}

module.exports = {
  COMMANDS,
  parseCommand,
  listCommands,
  appendDictate,
  announceJobMessage,
};

// UMD for browser demos that load this file alone
if (typeof window !== "undefined") {
  window.PocketVoiceCodingCore = module.exports;
}
