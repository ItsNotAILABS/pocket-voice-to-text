"use strict";

/**
 * Tests for POST /v1/turn/complete (trained pocket-voice-complete sidecar)
 * and the opt-in semantic signal in POST /v1/turn/decide.
 *
 * The trained model needs torch on this host. When torch or the checkpoint is
 * absent the endpoints must degrade to 503 / heuristic-only instead of
 * crashing — both paths are asserted.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { handler, sessions } = require("../server/api");

// Prefer a python with torch when this dev host has one; otherwise the
// tests exercise the 503-degradation path (CI-safe).
const VENV_PY = "/home/hatch/workspace/venvs/itsnotai/bin/python";
if (fs.existsSync(VENV_PY)) process.env.PYTHON = VENV_PY;

let server;
let port;

function post(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          let json = {};
          try {
            json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            json = {};
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

describe("turn completion (trained model)", () => {
  before(() => {
    sessions.clear();
    server = http.createServer((req, res) => {
      handler(req, res).catch((e) => {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
      });
    });
    return new Promise((r) => server.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      r();
    }));
  });

  after(() => new Promise((r) => server.close(r)));

  it("POST /v1/turn/complete scores a transcript or degrades to 503", async () => {
    const { status, json } = await post("/v1/turn/complete", { transcript: "what time is it" });
    if (status === 200) {
      assert.equal(json.ok, true);
      assert.equal(json.schema, "pocket.turn.complete.v1");
      assert.equal(json.model, "pocket-voice-complete-leg-3");
      assert.equal(json.own_stack, true);
      assert.equal(json.cloud, false);
      assert.ok(typeof json.score === "number" && json.score >= 0 && json.score <= 1);
      // leg-3 fixed the question-form false negative
      assert.equal(json.complete, true);
      assert.ok(json.score > 0.9, `expected high score, got ${json.score}`);
    } else {
      assert.equal(status, 503);
      assert.equal(json.ok, false);
      assert.ok(["not_installed", "model_missing", "turn_failed", "turn_timeout"].includes(json.error),
        `unexpected degradation code: ${json.error}`);
    }
  });

  it("POST /v1/turn/complete rejects empty transcripts with 400", async () => {
    const { status, json } = await post("/v1/turn/complete", { transcript: "" });
    assert.equal(status, 400);
    assert.equal(json.error, "empty_transcript");
  });

  it("POST /v1/turn/decide without semantic flag keeps the heuristic path", async () => {
    const { status, json } = await post("/v1/turn/decide", {
      transcript: "what time is it",
      silence_ms: 900,
      scenario: "patient",
    });
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.ok(json.reason, "heuristic decision has a reason");
    assert.equal(json.semantic, undefined, "no model call without the opt-in flag");
  });

  it("POST /v1/turn/decide with semantic:true lets the model break the heuristic gate", async () => {
    // Heuristic: trailing "and" -> semantic_incomplete. The trained model
    // scores this complete at 0.999, so the opt-in flag flips the decision.
    const { status, json } = await post("/v1/turn/decide", {
      transcript: "play some jazz and",
      silence_ms: 900,
      scenario: "patient",
      semantic: true,
    });
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.ok(json.semantic, "semantic block present with opt-in flag");
    if (json.semantic.complete !== undefined) {
      assert.equal(json.semantic.complete, true);
      assert.ok(json.semantic.score >= 0.9);
      assert.equal(json.reason, "semantic_model_complete");
      assert.equal(json.end, true);
    } else {
      assert.ok(json.semantic.error, "degradation reports a code, never crashes");
    }
  });
});
