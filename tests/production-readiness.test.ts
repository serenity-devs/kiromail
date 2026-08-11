import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};
const productionCompose = readFileSync("docker-compose.production.yml", "utf8");
const serverCompose = readFileSync("deploy/compose.server.yml", "utf8");
const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const deployCommand = readFileSync("deploy/kiromail-actions-command", "utf8");
const deployScript = readFileSync("deploy/kiromail-deploy", "utf8");
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

test("shared-server deployment never binds public ports or builds on the VPS", () => {
  assert.doesNotMatch(serverCompose, /^\s+ports:/m);
  assert.doesNotMatch(serverCompose, /^\s+build:/m);
  assert.match(serverCompose, /name: \$\{PUBLIC_PROXY_NETWORK:-valuebets_web\}/);
  assert.match(serverCompose, /aliases: \[kiromail-app\]/);
  assert.match(serverCompose, /internal: true/);
});

test("GitHub deployment uses immutable images and a forced SSH command", () => {
  assert.match(deployWorkflow, /platforms: linux\/amd64/);
  assert.match(deployWorkflow, /workflow_run\.event == 'push'/);
  assert.match(deployWorkflow, /kiromail-deploy@"\$VPS_HOST" "deploy \$RELEASE_SHA"/);
  assert.match(deployCommand, /\[0-9a-f\]\{40\}/);
  assert.match(deployScript, /Creating an encrypted backup before migration/);
  assert.match(deployScript, /Applying additive database migrations/);
  assert.match(deployScript, /Restoring the previous application images/);
  assert.doesNotMatch(deployScript, /docker compose build/);
});
