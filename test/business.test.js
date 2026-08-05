"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Business = require("../src/business");

describe("Business.listModes", () => {
  it("returns all business modes", () => {
    const modes = Business.listModes();
    assert.ok(Array.isArray(modes));
    assert.ok(modes.length >= 4);
    const ids = modes.map((m) => m.id);
    assert.ok(ids.includes("customer_service"));
    assert.ok(ids.includes("sales"));
    assert.ok(ids.includes("reception"));
    assert.ok(ids.includes("ops"));
  });
});

describe("Business.route customer_service", () => {
  it("matches refund", () => {
    const r = Business.route("customer_service", "I need a refund please");
    assert.equal(r.matched, true);
    assert.match(r.reply, /billing|order/i);
    assert.equal(r.mode, "customer_service");
  });
  it("matches cancel", () => {
    const r = Business.route("customer_service", "I want to cancel my subscription");
    assert.equal(r.matched, true);
    assert.match(r.reply, /cancel/i);
  });
  it("matches broken product", () => {
    const r = Business.route("customer_service", "The app is broken and not working");
    assert.equal(r.matched, true);
    assert.match(r.reply, /product|page|happens/i);
  });
  it("matches escalate to human", () => {
    const r = Business.route("customer_service", "I want a human agent please");
    assert.equal(r.matched, true);
    assert.match(r.reply, /escalate|callback|name/i);
  });
  it("matches greeting", () => {
    const r = Business.route("customer_service", "Hello there");
    assert.equal(r.matched, true);
    assert.match(r.reply, /help|hi|thanks/i);
  });
  it("fallback when unmatched", () => {
    const r = Business.route("customer_service", "zzzz quantum banana 42");
    assert.equal(r.matched, false);
    assert.ok(r.reply.length > 10);
  });
});

describe("Business.route sales", () => {
  it("matches pricing", () => {
    const r = Business.route("sales", "How much does it cost?");
    assert.equal(r.matched, true);
    assert.match(r.reply, /pricing|seat|team/i);
  });
  it("matches demo", () => {
    const r = Business.route("sales", "Can we schedule a demo?");
    assert.equal(r.matched, true);
    assert.match(r.reply, /demo/i);
  });
});

describe("Business.route reception", () => {
  it("routes to sales", () => {
    const r = Business.route("reception", "I want sales about pricing");
    assert.equal(r.matched, true);
    assert.match(r.reply, /sales/i);
  });
  it("routes to support", () => {
    const r = Business.route("reception", "I need help something is broken");
    assert.equal(r.matched, true);
    assert.match(r.reply, /support/i);
  });
});

describe("Business.route ops", () => {
  it("status brief", () => {
    const r = Business.route("ops", "Give me a status update");
    assert.equal(r.matched, true);
    assert.match(r.reply, /status|risk|green/i);
  });
  it("incident", () => {
    const r = Business.route("ops", "We have an outage down");
    assert.equal(r.matched, true);
    assert.match(r.reply, /incident|impacted/i);
  });
});

describe("Business.getMode", () => {
  it("defaults unknown to customer_service", () => {
    const m = Business.getMode("nope");
    assert.equal(m.id, "customer_service");
  });
});
