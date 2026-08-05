"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const Coding = require("../src/coding-core");

describe("Coding.parseCommand", () => {
  it("empty", () => {
    const r = Coding.parseCommand("  ");
    assert.equal(r.ok, false);
    assert.equal(r.type, "empty");
  });
  it("mic off", () => {
    const r = Coding.parseCommand("stop listening");
    assert.equal(r.type, "command");
    assert.equal(r.cmd, "mic_off");
  });
  it("run tests", () => {
    const r = Coding.parseCommand("run the tests");
    assert.equal(r.cmd, "run_tests");
  });
  it("summarize", () => {
    const r = Coding.parseCommand("summarize");
    assert.equal(r.cmd, "summarize");
  });
  it("new file with name", () => {
    const r = Coding.parseCommand("new file app.js");
    assert.equal(r.cmd, "new_file");
    assert.ok(r.args.length >= 1);
  });
  it("search for query", () => {
    const r = Coding.parseCommand("search for TODO");
    assert.equal(r.cmd, "search");
  });
  it("explain this", () => {
    const r = Coding.parseCommand("explain this");
    assert.equal(r.cmd, "explain");
  });
  it("dictate normal speech", () => {
    const r = Coding.parseCommand("add a login button on the left");
    assert.equal(r.type, "dictate");
    assert.match(r.text, /login button/i);
  });
});

describe("Coding.appendDictate", () => {
  it("starts empty", () => {
    assert.equal(Coding.appendDictate("", "hello"), "hello");
  });
  it("adds space between chunks", () => {
    assert.equal(Coding.appendDictate("hello", "world"), "hello world");
  });
  it("respects trailing newline", () => {
    assert.equal(Coding.appendDictate("line\n", "next"), "line\nnext");
  });
});

describe("Coding.announceJobMessage", () => {
  it("ok object", () => {
    assert.match(Coding.announceJobMessage({ ok: true }), /success/i);
  });
  it("fail object", () => {
    assert.match(Coding.announceJobMessage({ ok: false }), /issues/i);
  });
  it("string", () => {
    assert.equal(Coding.announceJobMessage("Build done"), "Build done");
  });
});

describe("Coding.listCommands", () => {
  it("lists examples", () => {
    const list = Coding.listCommands();
    assert.ok(list.length >= 5);
    assert.ok(list.every((c) => c.id && c.example));
  });
});
