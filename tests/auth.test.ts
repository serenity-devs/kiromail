import assert from "node:assert/strict";
import test from "node:test";
import { roleAllows } from "../lib/auth";
import { hashPassword, passwordIsStrong, verifyPassword } from "../lib/passwords";

test("passwords use salted scrypt hashes", async () => {
  const password = "una-frase-segura-2026";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, /^scrypt\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("otra-contraseña", first), false);
  assert.equal(passwordIsStrong("demasiado"), false);
});

test("roles enforce least privilege", () => {
  assert.equal(roleAllows("admin", "settings:write"), true);
  assert.equal(roleAllows("editor", "campaigns:send"), true);
  assert.equal(roleAllows("editor", "api_keys:manage"), false);
  assert.equal(roleAllows("analyst", "campaigns:read"), true);
  assert.equal(roleAllows("analyst", "contacts:read"), false);
  assert.equal(roleAllows("analyst", "campaigns:write"), false);
});
