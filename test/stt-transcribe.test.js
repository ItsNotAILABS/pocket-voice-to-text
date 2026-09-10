"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { handler } = require("../server/api");

let server;
let port;

function rawRequest(method, path, bodyBuffer, contentType) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": contentType,
          "Content-Length": bodyBuffer.length,
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
    req.write(bodyBuffer);
    req.end();
  });
}

function multipartBody(boundary, fields, files) {
  const parts = [];
  for (const [name, value] of Object.entries(fields || {})) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      )
    );
  }
  for (const [name, f] of Object.entries(files || {})) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${f.filename}"\r\n` +
          `Content-Type: ${f.contentType}\r\n\r\n`
      )
    );
    parts.push(f.data);
    parts.push(Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(parts);
}

before(async () => {
  server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});

after(async () => {
  await new Promise((r) => server.close(r));
});

describe("POST /v1/stt/transcribe (sovereign STT)", () => {
  it("lists local_whisper as the default engine", async () => {
    const { status, json } = await rawRequest("GET", "/v1/stt/engines", Buffer.alloc(0), "application/json");
    assert.equal(status, 200);
    assert.equal(json.default, "local_whisper");
    assert.ok(json.engines.some((e) => e.id === "local_whisper" && e.default));
    assert.ok(json.engines.some((e) => e.id === "webspeech" && /cloud/i.test(e.label)));
  });

  it("keeps JSON {text} back-compat for hybrid clients (no cloud)", async () => {
    const body = Buffer.from(JSON.stringify({ text: "hello pocket", engine: "hybrid" }));
    const { status, json } = await rawRequest("POST", "/v1/stt/transcribe", body, "application/json");
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.text, "hello pocket");
    assert.equal(json.own_stack, true);
  });

  it("rejects multipart without audio honestly", async () => {
    const body = multipartBody("b1", { lang: "en" }, {});
    const { status, json } = await rawRequest(
      "POST",
      "/v1/stt/transcribe",
      body,
      "multipart/form-data; boundary=b1"
    );
    assert.equal(status, 400);
    assert.equal(json.error, "no_audio");
  });

  it("returns 503 with setup hint when no local ASR is available", async () => {
    // No faster-whisper in this env and no POCKET host on :8787 ->
    // must NOT silently fall back to cloud; must say how to fix it.
    const body = multipartBody(
      "b2",
      { lang: "en" },
      { audio: { filename: "utt.webm", contentType: "audio/webm", data: Buffer.from([0, 1, 2, 3]) } }
    );
    const { status, json } = await rawRequest(
      "POST",
      "/v1/stt/transcribe",
      body,
      "multipart/form-data; boundary=b2"
    );
    assert.equal(status, 503);
    assert.equal(json.ok, false);
    assert.match(json.hint || "", /faster-whisper|setup-sovereign-stt/i);
    assert.equal(json.cloud, undefined); // never claims cloud transcription
  });
});
