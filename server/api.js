#!/usr/bin/env node
/**
 * Pocket Voice HTTP API — for friends & builders.
 * Zero deps. Node 18+.
 *
 *   npm start
 *   PORT=8790 API_KEY=dev npm start
 */
"use strict";

const http = require("http");
const { URL } = require("url");
const crypto = require("crypto");
const PocketVoice = require("../src/node-entry");

const PORT = Number(process.env.PORT || process.env.POCKET_VOICE_PORT || 8790);
const API_KEY = (process.env.API_KEY || process.env.POCKET_VOICE_API_KEY || "").trim();
const HOST = process.env.HOST || "0.0.0.0";

/** session_id -> engine */
const sessions = new Map();

function json(res, code, obj) {
  const body = JSON.stringify(obj, null, 0);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > 1_000_000) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function authOk(req) {
  if (!API_KEY) return true; // open local by default — set API_KEY in prod
  const h = req.headers["x-api-key"] || "";
  const auth = req.headers["authorization"] || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return h === API_KEY || bearer === API_KEY;
}

function getEngine(sessionId, body) {
  const id = sessionId || body.session_id || "default";
  if (!sessions.has(id)) {
    sessions.set(
      id,
      PocketVoice.createEngine({
        businessMode: body.business_mode || body.mode || "customer_service",
        personality: body.personality || undefined,
      })
    );
  }
  const eng = sessions.get(id);
  if (body.business_mode || body.mode) eng.setBusinessMode(body.business_mode || body.mode);
  if (body.personality) eng.setPersonality(body.personality);
  return { id, eng };
}

async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return json(res, 204, {});
  }

  const u = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = u.pathname.replace(/\/+$/, "") || "/";

  // Public
  if (req.method === "GET" && (path === "/" || path === "/health" || path === "/v1/health")) {
    return json(res, 200, {
      ok: true,
      product: "Pocket Voice API",
      version: PocketVoice.version,
      docs: "/v1",
      repo: "https://github.com/ItsNotAILABS/pocket-voice-to-text",
      auth_required: !!API_KEY,
    });
  }

  if (req.method === "GET" && path === "/v1") {
    return json(res, 200, {
      ok: true,
      version: PocketVoice.version,
      endpoints: {
        "GET /health": "Liveness",
        "GET /v1": "This catalog",
        "GET /v1/modes": "Business modes",
        "GET /v1/personalities": "Personalities",
        "GET /v1/commands": "Coding voice commands",
        "POST /v1/session": "Create session { business_mode?, personality? }",
        "POST /v1/turn": "Chat turn { text, session_id?, business_mode?, personality? }",
        "POST /v1/greet": "Greeting { session_id?, personality? }",
        "POST /v1/route": "One-shot business route { text, mode? } (stateless)",
        "POST /v1/coding/parse": "Parse coding utterance { text }",
        "POST /v1/tts/hint": "TTS payload for browser { text, rate? }",
        "DELETE /v1/session/:id": "Drop session",
      },
      auth: API_KEY
        ? "Send header X-API-Key: <key> or Authorization: Bearer <key>"
        : "Open (set env API_KEY to lock)",
      examples: {
        turn: 'curl -s localhost:8790/v1/turn -H "Content-Type: application/json" -d "{\\"text\\":\\"I need a refund\\"}"',
        route: 'curl -s localhost:8790/v1/route -H "Content-Type: application/json" -d "{\\"text\\":\\"hello\\",\\"mode\\":\\"sales\\"}"',
      },
    });
  }

  if (req.method === "GET" && path === "/v1/modes") {
    return json(res, 200, { ok: true, modes: PocketVoice.listModes() });
  }
  if (req.method === "GET" && path === "/v1/personalities") {
    return json(res, 200, { ok: true, personalities: PocketVoice.listPersonalities() });
  }
  if (req.method === "GET" && path === "/v1/commands") {
    return json(res, 200, { ok: true, commands: PocketVoice.listCommands() });
  }

  // Auth for mutating routes
  if (!authOk(req)) {
    return json(res, 401, { ok: false, error: "unauthorized", hint: "X-API-Key or Bearer token" });
  }

  try {
    if (req.method === "POST" && path === "/v1/session") {
      const body = await readBody(req);
      const id = body.session_id || crypto.randomBytes(8).toString("hex");
      sessions.set(
        id,
        PocketVoice.createEngine({
          businessMode: body.business_mode || body.mode || "customer_service",
          personality: body.personality,
        })
      );
      return json(res, 200, {
        ok: true,
        session_id: id,
        state: sessions.get(id).getState(),
      });
    }

    if (req.method === "POST" && path === "/v1/turn") {
      const body = await readBody(req);
      const { id, eng } = getEngine(body.session_id, body);
      const out = await eng.turn(body.text || body.utterance || body.message || "");
      out.session_id = id;
      return json(res, out.ok ? 200 : 400, out);
    }

    if (req.method === "POST" && path === "/v1/greet") {
      const body = await readBody(req);
      const { id, eng } = getEngine(body.session_id, body);
      const out = eng.greet();
      out.session_id = id;
      return json(res, 200, out);
    }

    if (req.method === "POST" && path === "/v1/route") {
      const body = await readBody(req);
      const mode = body.mode || body.business_mode || "customer_service";
      const text = body.text || body.utterance || "";
      const routed = PocketVoice.Business.route(mode, text);
      return json(res, 200, { ok: true, ...routed, text });
    }

    if (req.method === "POST" && path === "/v1/coding/parse") {
      const body = await readBody(req);
      const parsed = PocketVoice.Coding.parseCommand(body.text || "");
      return json(res, 200, { ok: true, ...parsed });
    }

    if (req.method === "POST" && path === "/v1/tts/hint") {
      const body = await readBody(req);
      const text = String(body.text || "").trim();
      if (!text) return json(res, 400, { ok: false, error: "empty_text" });
      return json(res, 200, {
        ok: true,
        tts_hint: {
          text,
          rate: Number(body.rate) || 1,
          lang: body.lang || "en-US",
          note: "Play with browser speechSynthesis or your TTS provider",
        },
      });
    }

    if (req.method === "DELETE" && path.startsWith("/v1/session/")) {
      const id = path.slice("/v1/session/".length);
      sessions.delete(id);
      return json(res, 200, { ok: true, deleted: id });
    }

    if (req.method === "GET" && path.startsWith("/v1/session/")) {
      const id = path.slice("/v1/session/".length);
      const eng = sessions.get(id);
      if (!eng) return json(res, 404, { ok: false, error: "session_not_found" });
      return json(res, 200, { ok: true, session_id: id, state: eng.getState(), history: eng.history() });
    }

    return json(res, 404, { ok: false, error: "not_found", catalog: "/v1" });
  } catch (e) {
    return json(res, 400, { ok: false, error: String(e.message || e) });
  }
}

function main() {
  const server = http.createServer((req, res) => {
    handler(req, res).catch((e) => json(res, 500, { ok: false, error: String(e.message || e) }));
  });
  server.listen(PORT, HOST, () => {
    console.log(`[pocket-voice-api] http://127.0.0.1:${PORT}`);
    console.log(`[pocket-voice-api] catalog  GET /v1`);
    console.log(`[pocket-voice-api] health   GET /health`);
    console.log(`[pocket-voice-api] auth     ${API_KEY ? "API_KEY required" : "open (set API_KEY to lock)"}`);
  });
}

if (require.main === module) main();

module.exports = { handler, main, sessions };
