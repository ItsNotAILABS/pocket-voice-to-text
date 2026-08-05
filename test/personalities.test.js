"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Personalities = require("../src/personalities");

describe("Personalities.list", () => {
  it("lists built-in personalities", () => {
    const list = Personalities.list();
    assert.ok(list.length >= 5);
    const ids = list.map((p) => p.id);
    assert.ok(ids.includes("support"));
    assert.ok(ids.includes("sales"));
    assert.ok(ids.includes("coder"));
    assert.ok(ids.includes("executive"));
    assert.ok(ids.includes("founder"));
  });
});

describe("Personalities.get", () => {
  it("returns support with greeting", () => {
    const p = Personalities.get("support");
    assert.equal(p.id, "support");
    assert.ok(p.greeting);
    assert.ok(p.system);
    assert.ok(p.ttsRate);
  });
  it("falls back to support for unknown", () => {
    const p = Personalities.get("unknown_xyz");
    assert.equal(p.id, "support");
  });
  it("merges custom personality", () => {
    const p = Personalities.get("brand", {
      brand: { id: "brand", name: "Brand", greeting: "Hey brand!", system: "Be cool.", ttsRate: 1.2 },
    });
    assert.equal(p.name, "Brand");
    assert.equal(p.greeting, "Hey brand!");
  });
});

describe("Personalities.mergeAll", () => {
  it("includes builtins", () => {
    const all = Personalities.mergeAll();
    assert.ok(all.support);
    assert.ok(all.coder);
  });
});
