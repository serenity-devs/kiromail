import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { env, publicAppUrl } from "../lib/config";

test("public form redirects use the configured application origin", () => {
  assert.equal(publicAppUrl("/unsubscribe/done").origin, new URL(env.appUrl).origin);

  for (const route of [
    "app/api/unsubscribe/route.ts",
    "app/api/public/confirm/route.ts",
    "app/api/public/preferences/route.ts",
  ]) {
    const source = readFileSync(route, "utf8");
    assert.match(source, /NextResponse\.redirect\(publicAppUrl\(/, route);
    assert.doesNotMatch(
      source,
      /NextResponse\.redirect\(new URL\([^\n]*request\.url/,
      route,
    );
  }
});
