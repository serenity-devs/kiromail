import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};
const productionCompose = readFileSync("docker-compose.production.yml", "utf8");
const demoSeed = readFileSync("scripts/seed.ts", "utf8");
const productionGuide = readFileSync("docs/produccion.md", "utf8");

test("production bootstrap never invokes demo data", () => {
  assert.equal(
    packageJson.scripts["db:setup:production"],
    "npm run db:migrate && npm run db:bootstrap",
  );
  assert.match(productionCompose, /command: npm run db:setup:production/);
  assert.doesNotMatch(packageJson.scripts["db:setup:production"], /seed/);
  assert.match(demoSeed, /--allow-demo-data/);
});

test("production operations use the combined Compose wrapper", () => {
  assert.match(productionGuide, /scripts\/prod-compose\.sh --profile ops up/);
  assert.match(productionGuide, /scripts\/prod-compose\.sh exec -T/);
  assert.match(productionGuide, /https:\/\/\$\{APP_DOMAIN\}\/api\/health\/ready/);
});
