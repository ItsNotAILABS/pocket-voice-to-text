/**
 * API keys + usage metering for sellable Voice API.
 * File-backed under ~/.pocket-voice/ (or POCKET_VOICE_HOME).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const HOME = process.env.POCKET_VOICE_HOME
  ? path.resolve(process.env.POCKET_VOICE_HOME)
  : path.join(os.homedir(), ".pocket-voice");
const KEYS_FILE = path.join(HOME, "api_keys.json");
const USAGE_FILE = path.join(HOME, "usage.jsonl");

function ensureHome() {
  if (!fs.existsSync(HOME)) fs.mkdirSync(HOME, { recursive: true });
}

function loadKeys() {
  ensureHome();
  try {
    if (fs.existsSync(KEYS_FILE)) {
      return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
    }
  } catch (_) {}
  return { keys: {} };
}

function saveKeys(data) {
  ensureHome();
  fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function hashKey(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

/**
 * Products for selling (self-serve positioning vs closed SaaS voice APIs).
 */
const PRODUCTS = {
  free: {
    id: "free",
    name: "Free / self-host",
    price_usd_month: 0,
    rpm: 60,
    turns_day: 2000,
    features: ["turn", "route", "coding", "patient_vad", "context_buffer"],
  },
  builder: {
    id: "builder",
    name: "Builder",
    price_usd_month: 29,
    rpm: 300,
    turns_day: 50000,
    features: ["turn", "route", "coding", "patient_vad", "context_buffer", "custom_brain_hook", "priority_support"],
  },
  business: {
    id: "business",
    name: "Business Voice",
    price_usd_month: 149,
    rpm: 2000,
    turns_day: 500000,
    features: [
      "turn",
      "route",
      "coding",
      "patient_vad",
      "context_buffer",
      "multi_personality",
      "hospitality_experts",
      "sla",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise / on-prem",
    price_usd_month: null,
    price_note: "Contact sales",
    rpm: 20000,
    turns_day: null,
    features: ["everything", "on_prem", "sso", "hipaa_ready_hosting_guidance", "custom_vad_hooks"],
  },
};

function mintKey(opts) {
  opts = opts || {};
  const raw = "pv_" + crypto.randomBytes(24).toString("base64url");
  const id = "key_" + crypto.randomBytes(4).toString("hex");
  const product = PRODUCTS[opts.product] || PRODUCTS.builder;
  const data = loadKeys();
  data.keys[hashKey(raw)] = {
    id,
    name: opts.name || "API key",
    product: product.id,
    created_at: Date.now(),
    rpm: opts.rpm != null ? opts.rpm : product.rpm,
    turns_day: opts.turns_day != null ? opts.turns_day : product.turns_day,
    owner: opts.owner || "local",
  };
  saveKeys(data);
  return {
    ok: true,
    api_key: raw, // shown once
    id,
    product: product.id,
    rpm: data.keys[hashKey(raw)].rpm,
    turns_day: data.keys[hashKey(raw)].turns_day,
  };
}

function verifyKey(raw) {
  if (!raw) return null;
  const data = loadKeys();
  return data.keys[hashKey(raw)] || null;
}

function recordUsage(keyId, event) {
  ensureHome();
  const line =
    JSON.stringify({
      at: Date.now(),
      key_id: keyId || "anon",
      event: event || "turn",
    }) + "\n";
  fs.appendFileSync(USAGE_FILE, line, "utf8");
}

/** Simple in-memory rate limit per key hash */
const _buckets = new Map();

function rateLimit(keyRec, keyHash) {
  if (!keyRec) return { ok: true };
  const rpm = keyRec.rpm || 60;
  const now = Date.now();
  const window = 60_000;
  let b = _buckets.get(keyHash);
  if (!b || now - b.start > window) {
    b = { start: now, count: 0 };
    _buckets.set(keyHash, b);
  }
  b.count += 1;
  if (b.count > rpm) {
    return { ok: false, error: "rate_limit", rpm, retry_after_ms: window - (now - b.start) };
  }
  return { ok: true, remaining: rpm - b.count };
}

function listProducts() {
  return Object.values(PRODUCTS);
}

module.exports = {
  PRODUCTS,
  listProducts,
  mintKey,
  verifyKey,
  recordUsage,
  rateLimit,
  hashKey,
  HOME,
};
