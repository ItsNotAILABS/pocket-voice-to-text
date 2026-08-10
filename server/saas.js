#!/usr/bin/env node
/**
 * Pocket Voice SaaS Layer
 *
 * Mount with SAAS_MODE=1.  Zero additional npm deps — uses only Node built-ins.
 *
 * Routes added when mounted:
 *   POST /v1/saas/checkout      — create Stripe checkout session (stub / real with STRIPE_SECRET_KEY)
 *   POST /v1/saas/webhook       — Stripe webhook receiver
 *   GET  /v1/saas/tenants       — list tenants (MASTER_KEY)
 *   GET  /v1/saas/tenant/:id    — tenant detail (MASTER_KEY)
 *   POST /v1/saas/tenant/:id/suspend   — suspend tenant (MASTER_KEY)
 *   POST /v1/saas/tenant/:id/unsuspend — unsuspend tenant (MASTER_KEY)
 *   POST /v1/saas/tenant/:id/upgrade   — change tier (MASTER_KEY)
 *   GET  /v1/saas/usage         — own usage (key holder) or all (MASTER_KEY)
 *   GET  /v1/admin/tenants      — alias for /v1/saas/tenants
 *   GET  /v1/admin/usage        — aggregate usage (MASTER_KEY)
 *   GET  /v1/tiers              — public tier listing
 */
"use strict";

const crypto = require("crypto");
const https = require("https");
const Keys = require("../src/keys");

// ── Tier definitions (mirrors products in keys.js, adds Stripe price IDs) ──
const TIERS = {
  free: {
    id: "free",
    name: "Free",
    price_usd_month: 0,
    rpm: 60,
    turns_day: 500,
    stripe_price_id: null,
    features: ["patient_vad", "hybrid_stt", "basic_personalities", "context_buffer"],
    note: "Self-host free forever",
  },
  pro: {
    id: "pro",
    name: "Pro",
    price_usd_month: 29,
    rpm: 600,
    turns_day: 50000,
    stripe_price_id: process.env.STRIPE_PRICE_PRO || "price_pro_placeholder",
    features: [
      "patient_vad",
      "hybrid_stt",
      "all_personalities",
      "context_buffer",
      "agentic_flows",
      "custom_brain_hook",
    ],
  },
  team: {
    id: "team",
    name: "Team",
    price_usd_month: 149,
    rpm: 3000,
    turns_day: 500000,
    stripe_price_id: process.env.STRIPE_PRICE_TEAM || "price_team_placeholder",
    features: [
      "patient_vad",
      "hybrid_stt",
      "all_personalities",
      "context_buffer",
      "agentic_flows",
      "multi_key",
      "hospitality_experts",
      "usage_dashboard",
      "sla_99_5",
    ],
    seats: 5,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price_usd_month: null,
    price_note: "Contact sales",
    rpm: 20000,
    turns_day: null,
    stripe_price_id: null,
    features: ["everything", "on_prem", "sso", "hipaa_ready", "custom_vad_hooks", "dedicated_support"],
  },
};

// ── In-memory tenant store (survives process restart via POCKET_VOICE_HOME files) ──
const _tenants = new Map(); // tenantId → TenantRecord
const _checkoutSessions = new Map(); // stripe session id → tenantId

function _tenantPath() {
  const fs = require("fs");
  const path = require("path");
  const dir = Keys.HOME;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "saas_tenants.json");
}

function _loadTenants() {
  const fs = require("fs");
  const p = _tenantPath();
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      for (const [id, rec] of Object.entries(raw)) _tenants.set(id, rec);
    }
  } catch (_) {}
}

function _saveTenants() {
  const fs = require("fs");
  const obj = {};
  for (const [id, rec] of _tenants) obj[id] = rec;
  fs.writeFileSync(_tenantPath(), JSON.stringify(obj, null, 2), "utf8");
}

_loadTenants();

// ── Usage tracking (aggregate per-tenant counters in memory, JSONL on disk) ──
const _usage = new Map(); // tenantId → { turns, sessions, decides, … }

function trackUsage(tenantId, event) {
  if (!tenantId) return;
  const u = _usage.get(tenantId) || {
    turns: 0,
    sessions: 0,
    decides: 0,
    total: 0,
    first_at: Date.now(),
    last_at: Date.now(),
  };
  u[event] = (u[event] || 0) + 1;
  u.total += 1;
  u.last_at = Date.now();
  _usage.set(tenantId, u);
  // Also delegate to Keys.recordUsage for backward compat
  Keys.recordUsage(tenantId, event);
}

function getUsage(tenantId) {
  return _usage.get(tenantId) || { turns: 0, total: 0 };
}

function allUsage() {
  const out = {};
  for (const [id, u] of _usage) out[id] = u;
  return out;
}

// ── Tenant helpers ──

function createTenant(opts) {
  const id = "tenant_" + crypto.randomBytes(6).toString("hex");
  const tier = TIERS[opts.tier] || TIERS.free;
  const { api_key, ...keyMeta } = Keys.mintKey({
    name: opts.email || opts.name || id,
    product: tier.id === "pro" ? "builder" : tier.id === "team" ? "business" : tier.id,
    rpm: tier.rpm,
    turns_day: tier.turns_day,
    owner: id,
  });
  const rec = {
    id,
    email: opts.email || "",
    name: opts.name || "",
    tier: tier.id,
    status: "active",
    stripe_customer_id: opts.stripe_customer_id || null,
    stripe_subscription_id: opts.stripe_subscription_id || null,
    api_key_id: keyMeta.id,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  _tenants.set(id, rec);
  _saveTenants();
  return { ...rec, api_key }; // api_key shown once
}

function getTenant(id) {
  return _tenants.get(id) || null;
}

function getTenantByCustomer(stripeCustomerId) {
  for (const [, rec] of _tenants) {
    if (rec.stripe_customer_id === stripeCustomerId) return rec;
  }
  return null;
}

function updateTenant(id, patch) {
  const rec = _tenants.get(id);
  if (!rec) return null;
  Object.assign(rec, patch, { updated_at: Date.now() });
  _saveTenants();
  return rec;
}

function listTenants() {
  return [..._tenants.values()];
}

// ── Stripe helper (zero-dep HTTP call) ──

function stripeRequest(method, path, params) {
  return new Promise((resolve, reject) => {
    const key = process.env.STRIPE_SECRET_KEY || "";
    if (!key) {
      // Stub mode — return a canned response
      return resolve({
        id: "cs_stub_" + crypto.randomBytes(8).toString("hex"),
        url: "#stripe-checkout-stub",
        status: "stub",
      });
    }
    const body = params ? new URLSearchParams(params).toString() : "";
    const opts = {
      hostname: "api.stripe.com",
      path,
      method,
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
        "Stripe-Version": "2023-10-16",
        "User-Agent": "pocket-voice-saas/1.0",
      },
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function createCheckoutSession(opts) {
  const tier = TIERS[opts.tier];
  if (!tier || !tier.stripe_price_id || (tier.stripe_price_id.startsWith("price_") && tier.stripe_price_id.endsWith("placeholder"))) {
    // Stub — no real Stripe price configured
    return {
      id: "cs_stub_" + crypto.randomBytes(8).toString("hex"),
      url: "#configure-stripe",
      stub: true,
      message: "Set STRIPE_SECRET_KEY + STRIPE_PRICE_PRO / STRIPE_PRICE_TEAM to enable real Stripe checkout",
    };
  }
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8790";
  const params = {
    "line_items[0][price]": tier.stripe_price_id,
    "line_items[0][quantity]": "1",
    mode: "subscription",
    success_url: frontendUrl + "/saas-dashboard.html?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: frontendUrl + "/saas-dashboard.html?canceled=1",
    "metadata[tier]": tier.id,
    "metadata[email]": opts.email || "",
  };
  if (opts.email) params["customer_email"] = opts.email;
  return stripeRequest("POST", "/v1/checkout/sessions", params);
}

// ── Stripe webhook verification (HMAC-SHA256) ──

function verifyStripeWebhook(rawBody, signature, secret) {
  if (!secret) {
    // No secret configured — accept in dev/stub mode.
    // WARNING: In production, always set STRIPE_WEBHOOK_SECRET so that
    // only genuine Stripe events are processed. Without it, anyone can
    // send forged events to provision tenants or alter subscription state.
    return { ok: true, stub: true };
  }
  try {
    const parts = {};
    for (const p of signature.split(",")) {
      const [k, v] = p.split("=");
      parts[k] = v;
    }
    const ts = parts.t;
    const sig = parts.v1;
    if (!ts || !sig) return { ok: false, error: "invalid_signature_format" };
    const payload = ts + "." + rawBody;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (expected !== sig) return { ok: false, error: "signature_mismatch" };
    const age = Math.abs(Date.now() / 1000 - Number(ts));
    if (age > 300) return { ok: false, error: "webhook_expired" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message) };
  }
}

// ── Route handler — called from api.js when SAAS_MODE=1 ──

async function handleSaasRoute(req, res, path, readBody, json, isMaster) {
  const WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();

  // ── Public: tier listing ──
  if (req.method === "GET" && path === "/v1/tiers") {
    return json(res, 200, { ok: true, tiers: Object.values(TIERS) });
  }

  // ── Checkout initiation (public POST) ──
  if (req.method === "POST" && path === "/v1/saas/checkout") {
    const body = await readBody(req);
    const tier = body.tier || "pro";
    if (!TIERS[tier]) return json(res, 400, { ok: false, error: "unknown_tier" });
    if (tier === "free") {
      // Free tier — provision immediately
      const tenant = createTenant({ tier: "free", email: body.email, name: body.name });
      return json(res, 200, {
        ok: true,
        tier: "free",
        tenant_id: tenant.id,
        api_key: tenant.api_key,
        message: "Free tier provisioned. Self-host or use the sandbox.",
      });
    }
    const cs = await createCheckoutSession({ tier, email: body.email });
    // Stash pending tenant so webhook can complete provisioning
    _checkoutSessions.set(cs.id, { tier, email: body.email, name: body.name });
    return json(res, 200, { ok: true, checkout_url: cs.url, session_id: cs.id, stub: cs.stub || false });
  }

  // ── Stripe webhook ──
  if (req.method === "POST" && path === "/v1/saas/webhook") {
    const rawBody = await _readRaw(req);
    const sig = req.headers["stripe-signature"] || "";
    const v = verifyStripeWebhook(rawBody, sig, WEBHOOK_SECRET);
    if (!v.ok) return json(res, 400, { ok: false, error: v.error });
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return json(res, 400, { ok: false, error: "invalid_json" });
    }
    await handleStripeEvent(event);
    return json(res, 200, { ok: true, received: event.type });
  }

  // ── Usage (key holder sees own; master sees all) ──
  if (req.method === "GET" && path === "/v1/saas/usage") {
    if (isMaster) return json(res, 200, { ok: true, usage: allUsage() });
    return json(res, 200, { ok: true, usage: {} }); // key-specific usage TBD
  }

  // ── Admin alias ──
  if (req.method === "GET" && (path === "/v1/admin/usage")) {
    if (!isMaster) return json(res, 403, { ok: false, error: "master_key_required" });
    return json(res, 200, { ok: true, usage: allUsage(), tenants: listTenants().length });
  }

  // ── Master-gated tenant admin ──
  if (!isMaster && path.startsWith("/v1/saas/tenant")) {
    return json(res, 403, { ok: false, error: "master_key_required" });
  }
  if (!isMaster && path.startsWith("/v1/admin")) {
    return json(res, 403, { ok: false, error: "master_key_required" });
  }

  if (req.method === "GET" && (path === "/v1/saas/tenants" || path === "/v1/admin/tenants")) {
    const tenants = listTenants().map((t) => ({ ...t, api_key: undefined }));
    return json(res, 200, {
      ok: true,
      count: tenants.length,
      tenants,
      usage: allUsage(),
    });
  }

  const tenantMatch = path.match(/^\/v1\/saas\/tenant\/([^/]+)(\/(.+))?$/);
  if (tenantMatch) {
    const tenantId = tenantMatch[1];
    const action = tenantMatch[3] || "";
    const tenant = getTenant(tenantId);
    if (!tenant) return json(res, 404, { ok: false, error: "tenant_not_found" });

    if (req.method === "GET" && !action) {
      return json(res, 200, { ok: true, tenant, usage: getUsage(tenantId) });
    }
    if (req.method === "POST" && action === "suspend") {
      updateTenant(tenantId, { status: "suspended" });
      return json(res, 200, { ok: true, tenant_id: tenantId, status: "suspended" });
    }
    if (req.method === "POST" && action === "unsuspend") {
      updateTenant(tenantId, { status: "active" });
      return json(res, 200, { ok: true, tenant_id: tenantId, status: "active" });
    }
    if (req.method === "POST" && action === "upgrade") {
      const body = await readBody(req);
      const newTier = TIERS[body.tier];
      if (!newTier) return json(res, 400, { ok: false, error: "unknown_tier" });
      updateTenant(tenantId, { tier: body.tier });
      return json(res, 200, { ok: true, tenant_id: tenantId, tier: body.tier });
    }
  }

  return null; // not handled — fall through to main handler
}

async function handleStripeEvent(event) {
  const type = event.type;
  const obj = event.data && event.data.object;
  if (!obj) return;

  if (type === "checkout.session.completed") {
    const csId = obj.id;
    const pending = _checkoutSessions.get(csId);
    const tier = (obj.metadata && obj.metadata.tier) || (pending && pending.tier) || "pro";
    const email = (obj.metadata && obj.metadata.email) || (pending && pending.email) || "";
    const stripeCustomer = obj.customer || null;
    const stripeSub = obj.subscription || null;
    const tenant = createTenant({
      tier,
      email,
      name: (pending && pending.name) || email,
      stripe_customer_id: stripeCustomer,
      stripe_subscription_id: stripeSub,
    });
    _checkoutSessions.delete(csId);
    return tenant;
  }

  if (type === "invoice.payment_failed") {
    const customerId = obj.customer;
    const tenant = getTenantByCustomer(customerId);
    if (tenant) updateTenant(tenant.id, { status: "payment_failed" });
  }

  if (type === "customer.subscription.deleted") {
    const customerId = obj.customer;
    const tenant = getTenantByCustomer(customerId);
    if (tenant) updateTenant(tenant.id, { status: "cancelled", tier: "free" });
  }
}

// ── Raw body reader (for webhook HMAC verification — must not parse JSON first) ──
function _readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > 1_000_000) { reject(new Error("body_too_large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

module.exports = {
  TIERS,
  handleSaasRoute,
  createTenant,
  getTenant,
  updateTenant,
  listTenants,
  trackUsage,
  getUsage,
  allUsage,
};
