import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  name: string;
  version: string;
};
const layout = readFileSync("app/layout.tsx", "utf8");
const auth = readFileSync("lib/auth.ts", "utf8");
const apiAuth = readFileSync("lib/api-auth.ts", "utf8");
const compose = readFileSync("docker-compose.yml", "utf8");
const readme = readFileSync("README.md", "utf8");

test("KiroMail is the public product identity", () => {
  assert.equal(packageJson.name, "kiromail");
  assert.equal(packageJson.version, "1.0.0-rc.2");
  assert.match(layout, /KiroMail — campañas con calma/);
  assert.match(layout, /kiro-cat\.svg/);
  assert.match(readme, /<h1 align="center">KiroMail<\/h1>/);
});

test("new installations use KiroMail identifiers", () => {
  assert.match(compose, /^name: kiromail$/m);
  assert.match(compose, /postgres:\/\/kiromail:kiromail@postgres:5432\/kiromail/);
  assert.match(auth, /COOKIE_NAME = "kiromail_session"/);
  assert.match(apiAuth, /`km_live_\$\{prefix\}_/);
});
