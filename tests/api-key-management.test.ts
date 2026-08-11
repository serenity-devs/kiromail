import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  apiKeyScopeGroups,
  apiKeyScopeLabels,
  apiKeyScopes,
} from "../lib/api-key-scopes";

const route = readFileSync("app/api/v1/api-keys/route.ts", "utf8");
const auth = readFileSync("lib/api-auth.ts", "utf8");
const openapi = readFileSync("lib/openapi.ts", "utf8");
const settings = readFileSync("components/mail-app.tsx", "utf8");

test("API key scopes have one shared validated source", () => {
  assert.equal(new Set(apiKeyScopes).size, apiKeyScopes.length);
  assert.deepEqual(
    apiKeyScopeGroups.flatMap((group) => group.scopes.map((scope) => scope.id)),
    [...apiKeyScopes],
  );
  for (const scope of apiKeyScopes) assert.ok(apiKeyScopeLabels[scope]);
  assert.match(route, /z\.enum\(apiKeyScopes\)/);
  assert.match(openapi, /enum: \[\.\.\.apiKeyScopes\]/);
});

test("API keys are attributable, expirable and never listed with their secret", () => {
  assert.match(route, /created_by_name/);
  assert.match(route, /La caducidad debe estar en el futuro/);
  assert.match(route, /createdBy: session\.user\.id/);
  assert.match(auth, /created_by\)/);
  assert.doesNotMatch(route.replaceAll("\n", " "), /SELECT[^`]*secret_hash/);
});

test("settings expose complete API key lifecycle management", () => {
  assert.match(settings, /function ApiKeysPanel/);
  assert.match(settings, /Nueva clave API/);
  assert.match(settings, /method: "POST"/);
  assert.match(settings, /method: "DELETE"/);
  assert.match(settings, /Selecciona al menos un permiso/);
  assert.match(settings, /navigator\.clipboard\.writeText\(apiKey\.token\)/);
  assert.match(settings, /Se muestra una sola vez/);
  assert.match(settings, /Solo un administrador puede crear, consultar o revocar claves API/);
});
