import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultSubscriberTableColumns,
  normalizeSubscriberTableColumns,
} from "../lib/list-table-columns";

test("subscriber table columns default to every supported global field", () => {
  assert.deepEqual(
    normalizeSubscriberTableColumns(undefined),
    defaultSubscriberTableColumns,
  );
});

test("subscriber table columns preserve per-list visibility and order", () => {
  assert.deepEqual(
    normalizeSubscriberTableColumns([
      "country",
      "language",
      "country",
      "unknown",
    ]),
    ["country", "language"],
  );
  assert.deepEqual(normalizeSubscriberTableColumns([]), []);
});
