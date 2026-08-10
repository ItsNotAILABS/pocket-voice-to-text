#!/usr/bin/env node
/**
 * Pocket Voice API v1 — sellable, self-host or cloud.
 *
 *   npm start
 *   PORT=8790 npm start
 *   REQUIRE_API_KEY=1  → mint keys via POST /v1/keys (master) or env MASTER_KEY
 */
"use strict";

const http = require("http");
const { URL } = require("url");
const crypto = require("crypto");
const PocketVoice = require("../src/node-entry");
const Keys = require("../src/keys");

const PORT = Number(process.env.PORT || process.env.POCKET_VOICE_PORT || 8790);
const HOST = process.env.HOST || "0.0.0.0";
const MASTER_KEY = (process.env.MASTER_KEY || process.env.POCKET_VOICE_MASTER_KEY || "").trim();
const REQUIRE_API_KEY =
  process.env.REQUIRE_API_KEY === "1" ||
  process.env.POCKET_VOICE_REQUIRE_KEY === "1" ||
  !!MASTER_KEY;
const LEGACY_API_KEY = (process.env.API_KEY || process.env.POCKET_VOICE_API_KEY || "").trim();
const SAAS_MODE = process.env.SAAS_MODE === "1" || process.env.POCKET_VOICE_SAAS === "1";

const Saas = SAAS_MODE ? require("./saas") : null;

const sessions = new Map();

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
    "Cache-Control": "no-store",
    "X-Pocket-Voice-Version": PocketVoice.version,
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

function extractKey(req) {
  const h = req.headers["x-api-key"] || "";
  const auth = req.headers["authorization"] || "";
  if (h) return String(h).trim();
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return "";
}

function auth(req) {
  const raw = extractKey(req);
  // Master key always ok
  if (MASTER_KEY && raw === MASTER_KEY) {
    return { ok: true, key: { id: "master", product: "enterprise", rpm: 20000 }, raw, hash: "master" };
  }
  // Legacy single env key
  if (LEGACY_API_KEY && raw === LEGACY_API_KEY) {
    return { ok: true, key: { id: "legacy", product: "builder", rpm: 300 }, raw, hash: Keys.hashKey(raw) };
  }
  // Minted keys
  if (raw && raw.startsWith("pv_")) {
    const rec = Keys.verifyKey(raw);
    if (rec) {
      const rl = Keys.rateLimit(rec, Keys.hashKey(raw));
      if (!rl.ok) return { ok: false, error: "rate_limit", ...rl };
      return { ok: true, key: rec, raw, hash: Keys.hashKey(raw), rate: rl };
    }
  }
  // Open mode for local demos
  if (!REQUIRE_API_KEY) {
    return { ok: true, key: { id: "anon", product: "free", rpm: 60 }, raw: "", hash: "anon" };
  }
  return { ok: false, error: "unauthorized" };
}

function getEngine(sessionId, body) {
  const id = sessionId || body.session_id || "default";
  if (!sessions.has(id)) {
    sessions.set(
      id,
      PocketVoice.createEngine({
        businessMode: body.business_mode || body.mode || "customer_service",
        personality: body.personality || undefined,
        scenario: body.scenario || "patient",
        stress: body.stress != null ? body.stress : 0.35,
        expert: body.expert || "hotel_host",
        barge_in: body.barge_in || "medium",
      })
    );
  }
  const eng = sessions.get(id);
  // Business mode first (may set default personality), then explicit persona wins
  if (body.business_mode || body.mode) eng.setBusinessMode(body.business_mode || body.mode);
  if (body.personality) {
    eng.setPersonality(body.personality);
  } else {
    const pn = String(body.persona || body.persona_name || "").toLowerCase();
    if (pn.includes("aria")) eng.setPersonality("aria");
  }
  if (body.scenario || body.stress != null || body.expert || body.barge_in) {
    eng.configureListening({
      scenario: body.scenario,
      stress: body.stress,
      expert: body.expert,
      barge_in: body.barge_in,
    });
  }
  return { id, eng };
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});

  const u = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = u.pathname.replace(/\/+$/, "") || "/";

  // —— Public ——
  if (req.method === "GET" && (path === "/" || path === "/health" || path === "/v1/health")) {
    return json(res, 200, {
      ok: true,
      product: "Pocket Voice API",
      version: PocketVoice.version,
      docs: "/v1",
      pricing: "/v1/products",
      repo: "https://github.com/ItsNotAILABS/pocket-voice-to-text",
      auth_required: REQUIRE_API_KEY,
      positioning: "Open-source alternative to closed voice SaaS — patient VAD, personalities, self-host free",
    });
  }

  if (req.method === "GET" && path === "/v1") {
    return json(res, 200, {
      ok: true,
      version: PocketVoice.version,
      sell: {
        products: "/v1/products",
        mint_key: "POST /v1/keys  (requires MASTER_KEY)",
        vs_closed_saas: "Self-host free · own your stack · patient listening built-in · MIT",
      },
      endpoints: {
        "GET /health": "Liveness",
        "GET /v1/products": "Pricing tiers (sellable)",
        "GET /v1/modes": "Business modes",
        "GET /v1/personalities": "Personalities",
        "GET /v1/commands": "Coding voice commands",
        "GET /v1/scenarios": "Patient VAD scenarios (200–2000ms)",
        "GET /v1/experts": "Context experts (airport, hotel, …)",
        "POST /v1/turn": "Chat turn + context buffer + fusion + agentic flows",
        "POST /v1/turn/decide": "Hybrid end-of-turn (silence + semantic)",
        "POST /v1/fusion/metadata": "Build conversational Fusion input vector (no industry Deep Fusion)",
        "GET /v1/flows": "Agentic multi-step voice flows",
        "POST /v1/flows/advance": "Advance / match agentic flow",
        "GET /v1/stt/engines": "Own STT engines (hybrid · pocket · webspeech)",
        "POST /v1/stt/transcribe": "Own STT scaffold",
        "POST /v1/barge-in": "Barge-in decision",
        "POST /v1/context": "Put cross-domain buffer fact",
        "POST /v1/listening": "Configure patient/stress/expert for session",
        "POST /v1/session": "Create session",
        "POST /v1/greet": "Greeting",
        "POST /v1/route": "Stateless business route",
        "POST /v1/coding/parse": "Coding utterance parse",
        "POST /v1/tts/hint": "TTS payload",
        "POST /v1/keys": "Mint API key (master)",
      },
      stt: {
        schema: PocketVoice.STT_SCHEMA || "pocket.stt.v1",
        engines: PocketVoice.STT_ENGINES || ["hybrid", "pocket", "webspeech"],
        own_stack: true,
      },
      agentic_flows: true,
      fusion: {
        schema: PocketVoice.FUSION_SCHEMA || "pocket.voice.fusion_metadata.v1",
        version: PocketVoice.FUSION_VERSION || "1.0",
        note: "Public stack emits metadata only. Industry Deep Fusion lives in POCKET host.",
      },
      examples: {
        turn:
          'curl -s localhost:8790/v1/turn -H "Content-Type: application/json" -d "{\\"text\\":\\"I need a refund\\",\\"scenario\\":\\"patient\\"}"',
        decide:
          'curl -s localhost:8790/v1/turn/decide -H "Content-Type: application/json" -d "{\\"transcript\\":\\"my flight is\\",\\"silence_ms\\":900,\\"scenario\\":\\"patient\\"}"',
      },
    });
  }

  if (req.method === "GET" && path === "/v1/products") {
    return json(res, 200, {
      ok: true,
      currency: "USD",
      products: PocketVoice.listProducts(),
      note: "Self-host free forever. Paid tiers are for hosted SaaS you run — or use as price cards.",
      compare: {
        closed_saas: "Usage ~$0.05–0.21/min, lock-in, proprietary full-duplex",
        pocket_voice: "MIT · self-host $0 · patient 1400ms VAD · fork & extend · optional paid host",
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
  if (req.method === "GET" && path === "/v1/scenarios") {
    return json(res, 200, {
      ok: true,
      scenarios: PocketVoice.listScenarios(),
      default: "patient",
      default_silence_ms: 1400,
      guidance: "Travel/healthcare: 1000–1500ms. Fast sales: 200–400ms. Dictation: 2000ms+.",
    });
  }
  if (req.method === "GET" && path === "/v1/experts") {
    return json(res, 200, { ok: true, experts: PocketVoice.listExperts() });
  }
  if (req.method === "GET" && path === "/v1/flows") {
    return json(res, 200, {
      ok: true,
      flows: PocketVoice.listFlows ? PocketVoice.listFlows() : [],
      version: PocketVoice.version,
    });
  }
  if (req.method === "GET" && path === "/v1/stt/engines") {
    return json(res, 200, {
      ok: true,
      schema: PocketVoice.STT_SCHEMA || "pocket.stt.v1",
      engines: PocketVoice.STT_ENGINES || ["hybrid", "pocket", "webspeech"],
      own_stack: true,
      default: "hybrid",
    });
  }

  // —— SaaS routes (SAAS_MODE=1) ——
  if (SAAS_MODE) {
    const isMaster = MASTER_KEY && extractKey(req) === MASTER_KEY;
    const saasResult = await Saas.handleSaasRoute(req, res, path, readBody, json, isMaster);
    if (saasResult !== null) return saasResult;
  }

  // —— Auth for write routes ——
  const a = auth(req);
  const publicGet = req.method === "GET";
  if (!publicGet && !a.ok) {
    return json(res, 401, {
      ok: false,
      error: a.error || "unauthorized",
      hint: "X-API-Key: pv_… or Bearer. Local open mode if REQUIRE_API_KEY unset.",
    });
  }

  try {
    // Mint key (master only)
    if (req.method === "POST" && path === "/v1/keys") {
      const body = await readBody(req);
      const raw = extractKey(req);
      if (!MASTER_KEY || raw !== MASTER_KEY) {
        return json(res, 403, { ok: false, error: "master_key_required", hint: "Set MASTER_KEY env" });
      }
      return json(res, 200, Keys.mintKey(body));
    }

    if (req.method === "POST" && path === "/v1/session") {
      const body = await readBody(req);
      const id = body.session_id || crypto.randomBytes(8).toString("hex");
      sessions.set(
        id,
        PocketVoice.createEngine({
          businessMode: body.business_mode || body.mode || "customer_service",
          personality: body.personality,
          scenario: body.scenario || "patient",
          stress: body.stress != null ? body.stress : 0.35,
          expert: body.expert || "hotel_host",
          barge_in: body.barge_in || "medium",
        })
      );
      if (a.key) Keys.recordUsage(a.key.id, "session");
      return json(res, 200, { ok: true, session_id: id, state: sessions.get(id).getState() });
    }

    if (req.method === "POST" && path === "/v1/turn") {
      const body = await readBody(req);
      const { id, eng } = getEngine(body.session_id, body);
      if (body.context && typeof body.context === "object") {
        Object.keys(body.context).forEach((domain) => {
          const bag = body.context[domain];
          if (bag && typeof bag === "object") {
            Object.keys(bag).forEach((k) => eng.putContext(domain, k, bag[k]));
          }
        });
      }
      const out = await eng.turn(body.text || body.utterance || body.message || "", {
        silence_ms: body.silence_ms,
        is_final: body.is_final,
        scenario: body.scenario,
        stress: body.stress,
        expert: body.expert,
        energy: body.energy,
        speech_active: body.speech_active,
        require_end: body.require_end,
      });
      out.session_id = id;
      if (a.key) Keys.recordUsage(a.key.id, "turn");
      return json(res, out.ok || out.waiting ? 200 : 400, out);
    }

    if (req.method === "POST" && path === "/v1/turn/decide") {
      const body = await readBody(req);
      const transcript = body.transcript || body.text || "";
      const d = PocketVoice.shouldEndTurn({
        transcript,
        silenceMs: body.silence_ms,
        isFinal: body.is_final,
        scenario: body.scenario || "patient",
        stress: body.stress,
        expert: body.expert,
        energy: body.energy,
        speechActive: body.speech_active,
        speakingRate: body.speaking_rate,
      });
      let fusion = null;
      try {
        if (body.session_id && sessions.has(body.session_id)) {
          fusion = sessions.get(body.session_id).getFusionMetadata({
            transcript,
            decision: d,
            is_final: body.is_final,
            stress: body.stress,
            expert: body.expert,
            scenario: body.scenario,
            energy: body.energy,
            speaking_rate: body.speaking_rate,
            session_id: body.session_id,
          });
        } else if (PocketVoice.buildFusionMetadata) {
          fusion = PocketVoice.buildFusionMetadata({
            transcript,
            decision: d,
            is_final: body.is_final,
            stress: body.stress,
            expert: body.expert || "hotel_host",
            scenario: body.scenario || "patient",
            energy: body.energy,
            silence_ms: body.silence_ms,
            speaking_rate: body.speaking_rate,
            speechActive: body.speech_active,
            incomplete: d.incomplete,
            complete: d.complete,
            context_buffer: body.context || body.context_buffer,
            session_id: body.session_id,
          });
        }
      } catch (_) {
        fusion = null;
      }
      if (a.key) Keys.recordUsage(a.key.id, "decide");
      return json(res, 200, { ok: true, ...d, fusion });
    }

    if (req.method === "POST" && path === "/v1/flows/advance") {
      const body = await readBody(req);
      const text = body.text || body.utterance || body.transcript || "";
      const state = body.state || body.flow_state || {};
      if (body.flow_id) state.flow_id = body.flow_id;
      const out = PocketVoice.advanceFlow
        ? PocketVoice.advanceFlow(state, text)
        : { ok: false, error: "flows_unavailable" };
      return json(res, 200, { ok: true, ...out, text });
    }

    if (req.method === "POST" && path === "/v1/stt/transcribe") {
      const body = await readBody(req);
      // Own STT scaffold: accept client transcript + energy; optional host does heavy ASR
      const text = String(body.text || body.transcript || "").trim();
      return json(res, 200, {
        ok: true,
        schema: "pocket.stt.v1",
        engine: body.engine || "hybrid",
        text: text,
        is_final: body.is_final !== false,
        energy: body.energy,
        speech_active: body.speech_active,
        note: text
          ? "Transcript accepted on own stack"
          : "Provide text from hybrid/webspeech, or wire host Whisper at POCKET /v1/voice/stt",
        host_stt_hint: "POST POCKET /v1/voice/stt with audio when local ASR is installed",
      });
    }

    if (req.method === "POST" && path === "/v1/fusion/metadata") {
      const body = await readBody(req);
      const { id, eng } = getEngine(body.session_id, body);
      if (body.context && typeof body.context === "object") {
        Object.keys(body.context).forEach((domain) => {
          const bag = body.context[domain];
          if (bag && typeof bag === "object") {
            Object.keys(bag).forEach((k) => eng.putContext(domain, k, bag[k]));
          }
        });
      }
      const meta = eng.getFusionMetadata({
        transcript: body.transcript || body.text || "",
        is_final: body.is_final,
        stress: body.stress,
        expert: body.expert,
        scenario: body.scenario,
        energy: body.energy,
        speaking_rate: body.speaking_rate,
        silence_ms: body.silence_ms,
        session_id: id,
        industry: body.industry || "dfw_airline_hospitality",
        history_length: body.history_length,
      });
      return json(res, 200, { ok: true, session_id: id, fusion: meta });
    }

    if (req.method === "POST" && path === "/v1/barge-in") {
      const body = await readBody(req);
      const d = PocketVoice.shouldBargeIn({
        sensitivity: body.sensitivity || body.barge_in || "medium",
        energy: body.energy,
        speechActive: body.speech_active,
        interim: body.interim || body.transcript || "",
      });
      return json(res, 200, { ok: true, ...d });
    }

    if (req.method === "POST" && path === "/v1/listening") {
      const body = await readBody(req);
      const { id, eng } = getEngine(body.session_id, body);
      const st = eng.configureListening(body);
      return json(res, 200, { ok: true, session_id: id, listening: st });
    }

    if (req.method === "POST" && path === "/v1/context") {
      const body = await readBody(req);
      const { id, eng } = getEngine(body.session_id, body);
      const r = eng.putContext(body.domain || "general", body.key || "note", body.value);
      return json(res, 200, { ok: true, session_id: id, ...r, prompt: eng.contextPrompt() });
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
      return json(res, 200, { ok: true, ...PocketVoice.Coding.parseCommand(body.text || "") });
    }

    if (req.method === "POST" && path === "/v1/tts/hint") {
      const body = await readBody(req);
      const text = String(body.text || "").trim();
      if (!text) return json(res, 400, { ok: false, error: "empty_text" });
      return json(res, 200, {
        ok: true,
        tts_hint: { text, rate: Number(body.rate) || 1, lang: body.lang || "en-US" },
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
      return json(res, 200, {
        ok: true,
        session_id: id,
        state: eng.getState(),
        history: eng.history(),
      });
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
    console.log(`[pocket-voice-api] v${PocketVoice.version}  http://127.0.0.1:${PORT}`);
    console.log(`[pocket-voice-api] catalog  GET /v1`);
    console.log(`[pocket-voice-api] products GET /v1/products`);
    console.log(`[pocket-voice-api] patient  1400ms default · POST /v1/turn/decide`);
    console.log(
      `[pocket-voice-api] auth     ${REQUIRE_API_KEY ? "API keys required" : "open local (set REQUIRE_API_KEY=1 to sell)"}`
    );
    if (SAAS_MODE) {
      console.log(`[pocket-voice-api] saas     ENABLED · tiers GET /v1/tiers · checkout POST /v1/saas/checkout`);
      console.log(`[pocket-voice-api] admin    GET /v1/admin/tenants · GET /v1/admin/usage`);
    }
  });
}

if (require.main === module) main();
module.exports = { handler, main, sessions };
