"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { handler, sessions } = require("../server/api");

function request(server, method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: server.address().port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
          ...(headers || {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = {};
          try {
            json = raw ? JSON.parse(raw) : {};
          } catch {
            json = { raw };
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

describe("HTTP API", () => {
  let server;
  before(() => {
    sessions.clear();
    server = http.createServer((req, res) => {
      handler(req, res).catch((e) => {
        res.writeHead(500);
        res.end(JSON.stringify({ error: String(e) }));
      });
    });
    return new Promise((r) => server.listen(0, "127.0.0.1", r));
  });
  after(() => new Promise((r) => server.close(r)));

  it("GET /health", async () => {
    const r = await request(server, "GET", "/health");
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
  });

  it("GET /v1 catalog", async () => {
    const r = await request(server, "GET", "/v1");
    assert.equal(r.status, 200);
    assert.ok(r.json.endpoints);
  });

  it("GET /v1/modes", async () => {
    const r = await request(server, "GET", "/v1/modes");
    assert.equal(r.status, 200);
    assert.ok(r.json.modes.length >= 4);
  });

  it("GET /v1/personalities", async () => {
    const r = await request(server, "GET", "/v1/personalities");
    assert.equal(r.status, 200);
    assert.ok(r.json.personalities.length >= 5);
  });

  it("GET /v1/commands", async () => {
    const r = await request(server, "GET", "/v1/commands");
    assert.equal(r.status, 200);
    assert.ok(r.json.commands.length >= 5);
  });

  it("POST /v1/route", async () => {
    const r = await request(server, "POST", "/v1/route", { text: "I need a refund", mode: "customer_service" });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.matched, true);
  });

  it("POST /v1/turn", async () => {
    const r = await request(server, "POST", "/v1/turn", { text: "hello", session_id: "t1" });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.ok(r.json.reply);
    assert.equal(r.json.session_id, "t1");
  });

  it("POST /v1/session + greet", async () => {
    const s = await request(server, "POST", "/v1/session", { business_mode: "sales" });
    assert.equal(s.status, 200);
    const id = s.json.session_id;
    const g = await request(server, "POST", "/v1/greet", { session_id: id });
    assert.equal(g.status, 200);
    assert.ok(g.json.reply);
  });

  it("POST /v1/coding/parse", async () => {
    const r = await request(server, "POST", "/v1/coding/parse", { text: "run the tests" });
    assert.equal(r.status, 200);
    assert.equal(r.json.cmd, "run_tests");
  });

  it("POST /v1/tts/hint", async () => {
    const r = await request(server, "POST", "/v1/tts/hint", { text: "Hello world" });
    assert.equal(r.status, 200);
    assert.equal(r.json.tts_hint.text, "Hello world");
  });

  it("DELETE session", async () => {
    const s = await request(server, "POST", "/v1/session", {});
    const id = s.json.session_id;
    const d = await request(server, "DELETE", "/v1/session/" + id);
    assert.equal(d.status, 200);
    assert.equal(d.json.deleted, id);
  });

  it("404 unknown", async () => {
    const r = await request(server, "GET", "/nope");
    assert.equal(r.status, 404);
  });
});
