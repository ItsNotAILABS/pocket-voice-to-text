"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const PocketVoice = require("../src/node-entry");

describe("voice studio contract", () => {
  it("exports studio capabilities", () => {
    const caps = PocketVoice.getStudioCapabilities({
      provider: "test-provider",
      voices: ["alpha", "beta"],
      realtime_transport: "webrtc",
    });
    assert.equal(caps.schema, "pocket.voice.studio.capabilities.v1");
    assert.equal(caps.provider, "test-provider");
    assert.deepEqual(caps.voices, ["alpha", "beta"]);
    assert.equal(caps.context_snap, true);
    assert.equal(caps.telemetry, true);
    assert.equal(caps.realtime_transport, "webrtc");
  });

  it("exposes mindsets and visualizers", () => {
    assert.ok(PocketVoice.listStudioMindsets().some((m) => m.id === "senior_coding_architect"));
    assert.ok(PocketVoice.listStudioVisualizers().includes("quantum_core"));
    assert.ok(PocketVoice.listStudioVisualizers().includes("zen_lotus"));
  });

  it("normalizes editor context snaps", () => {
    const result = PocketVoice.normalizeContextSnap({
      source: "editor",
      filename: "src/app.js",
      language: "javascript",
      code: "const answer = 42;",
      selection: { startLine: 1, endLine: 1, startColumn: 1, endColumn: 19 },
      metadata: { workspace: "demo" },
    });
    assert.equal(result.ok, true);
    assert.equal(result.snap.schema, "pocket.voice.context_snap.v1");
    assert.equal(result.snap.file, "src/app.js");
    assert.equal(result.snap.content, "const answer = 42;");
    assert.equal(result.snap.selection.end_column, 19);
  });

  it("rejects empty context snaps", () => {
    assert.deepEqual(PocketVoice.normalizeContextSnap({}), {
      ok: false,
      error: "context_content_required",
    });
  });

  it("rejects oversized context snaps", () => {
    const result = PocketVoice.normalizeContextSnap({ content: "x".repeat(200001) });
    assert.equal(result.ok, false);
    assert.equal(result.error, "context_content_too_large");
    assert.equal(result.max_chars, 200000);
  });
});
