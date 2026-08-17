import assert from "node:assert/strict";
import test from "node:test";
import { formatBuildDate, shortBuildCommit } from "../lib/build-info";

test("build metadata produces a compact deploy fingerprint", () => {
  assert.equal(shortBuildCommit("71f63302358ab2a60fdce03a74354f233a180a95"), "71f6330");
  assert.equal(shortBuildCommit("local"), "local");
  assert.match(formatBuildDate("2026-08-17T12:34:00Z"), /17 ago 2026.*12:34.*UTC/);
  assert.equal(formatBuildDate(""), "compilación local");
});
