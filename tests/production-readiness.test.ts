import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};
const productionCompose = readFileSync("docker-compose.production.yml", "utf8");
const serverCompose = readFileSync("deploy/compose.server.yml", "utf8");
const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const dockerfile = readFileSync("Dockerfile", "utf8");
const deployScript = readFileSync("deploy/kiromail-deploy", "utf8");
const updateScript = readFileSync("deploy/kiromail-update", "utf8");
const containerEntrypoint = readFileSync("docker-entrypoint.sh", "utf8");
const productionSecrets = readFileSync("scripts/init-production-secrets.sh", "utf8");
const queueSource = readFileSync("lib/queue.ts", "utf8");
const demoSeed = readFileSync("scripts/seed.ts", "utf8");
const productionGuide = readFileSync("docs/produccion.md", "utf8");
const readme = readFileSync("README.md", "utf8");

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

test("server deployment gates startup on liveness and preserves readiness for onboarding", () => {
  assert.match(serverCompose, /api\/health\/live/);
  assert.doesNotMatch(serverCompose, /fetch\('http:\/\/127\.0\.0\.1:3000\/api\/health\/ready'/);
  assert.match(productionGuide, /readiness sigue siendo el control de\s+lanzamiento/);
});

test("shared-server deployment never binds public ports or builds on the VPS", () => {
  assert.doesNotMatch(serverCompose, /^\s+ports:/m);
  assert.doesNotMatch(serverCompose, /^\s+build:/m);
  assert.match(serverCompose, /name: \$\{PUBLIC_PROXY_NETWORK:-valuebets_web\}/);
  assert.match(serverCompose, /aliases: \[kiromail-app\]/);
  assert.match(serverCompose, /\n  kiromail-app:\n/);
  assert.doesNotMatch(serverCompose, /\n  app:\n/);
  assert.match(deployScript, /app_service=kiromail-app/);
  assert.match(deployScript, /legacy_service" != app/);
  assert.match(serverCompose, /internal: true/);
});

test("shared-server worker has isolated outbound connectivity", () => {
  const workerService = serverCompose.match(/\n  worker:\n([\s\S]*?)(?=\n  backup:\n)/)?.[1] ?? "";
  assert.match(workerService, /networks: \[private, egress\]/);
  assert.match(serverCompose, /\n  egress:\n    driver: bridge\n/);
  assert.doesNotMatch(workerService, /public_proxy/);
});

test("the non-root runtime receives private copies of Compose bind-mounted secrets", () => {
  assert.match(containerEntrypoint, /runtime_secrets_dir=\/tmp\/kiromail-secrets/);
  assert.match(containerEntrypoint, /chmod 0400 "\$secret_target"/);
  assert.match(containerEntrypoint, /chown kiromail:kiromail "\$secret_target"/);
  assert.match(containerEntrypoint, /su-exec kiromail/);
});

test("database connection secrets avoid reserved URL characters", () => {
  assert.match(productionSecrets, /openssl rand -hex "\$bytes"/);
  assert.match(productionSecrets, /create_random_url_secret "\$secrets_dir\/postgres_password"/);
  assert.match(productionSecrets, /create_random_url_secret "\$secrets_dir\/redis_password"/);
});

test("Redis credentials are decoded before BullMQ authenticates", () => {
  assert.match(queueSource, /password: redis\.password \? decodeURIComponent\(redis\.password\)/);
  assert.match(queueSource, /username: redis\.username \? decodeURIComponent\(redis\.username\)/);
});

test("production IAM guidance permits raw transactional messages", () => {
  assert.match(readme, /ses:SendRawEmail/);
  assert.match(productionGuide, /ses:SendRawEmail/);
});

test("GitHub deployment publishes verified immutable archives without VPS credentials", () => {
  assert.match(deployWorkflow, /platforms: linux\/amd64/);
  assert.match(deployWorkflow, /workflow_run\.event == 'push'/);
  assert.match(deployWorkflow, /sha256sum kiromail-/);
  assert.match(deployWorkflow, /gh release upload production/);
  assert.match(deployWorkflow, /BUILD_DATE=\$\{\{ steps\.release_metadata\.outputs\.build_date \}\}/);
  assert.match(dockerfile, /ENV KIROMAIL_BUILD_COMMIT=\$VCS_REF/);
  assert.match(dockerfile, /ENV KIROMAIL_BUILD_DATE=\$BUILD_DATE/);
  assert.doesNotMatch(deployWorkflow, /VPS_|ssh /);
  assert.match(updateScript, /\[0-9a-f\]\{40\}/);
  assert.match(updateScript, /sha256sum --check/);
  assert.match(updateScript, /org\.opencontainers\.image\.revision/);
  assert.match(deployScript, /Creating an encrypted backup before migration/);
  assert.match(deployScript, /Applying additive database migrations/);
  assert.match(deployScript, /Restoring the previous application images/);
  assert.doesNotMatch(deployScript, /docker compose build/);
});
