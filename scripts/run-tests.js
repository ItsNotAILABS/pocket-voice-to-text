/**
 * Cross-platform test runner (Windows + Linux CI).
 * Avoids shell glob expansion differences for `node --test`.
 */
"use strict";
const { readdirSync } = require("fs");
const { spawnSync } = require("child_process");
const { join } = require("path");

const dir = join(__dirname, "..", "test");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => join(dir, f))
  .sort();

if (!files.length) {
  console.error("No test/*.test.js files found");
  process.exit(1);
}

const r = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  cwd: join(__dirname, ".."),
});
process.exit(r.status == null ? 1 : r.status);
