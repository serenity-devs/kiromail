import assert from "node:assert/strict";
import test from "node:test";
import { decryptTotpSecret, encryptTotpSecret, generateRecoveryCodes, matchRecoveryCode, totpUri, verifyTotp } from "../lib/mfa";

test("TOTP verifies the RFC 4226 counter vector with a narrow time window",()=>{
  const secret="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(verifyTotp(secret,"287082",30_000),true);
  assert.equal(verifyTotp(secret,"287082",150_000),false);
  assert.equal(verifyTotp(secret,"12345",30_000),false);
});

test("MFA secrets encrypt at rest and recovery codes match only their own hash",()=>{
  const encrypted=encryptTotpSecret("JBSWY3DPEHPK3PXP");
  assert.notEqual(encrypted,"JBSWY3DPEHPK3PXP");
  assert.equal(decryptTotpSecret(encrypted),"JBSWY3DPEHPK3PXP");
  const recovery=generateRecoveryCodes(3);
  assert.equal(recovery.codes.length,3);
  assert.equal(matchRecoveryCode(recovery.hashes,recovery.codes[1]),1);
  assert.equal(matchRecoveryCode(recovery.hashes,"0000-0000"),-1);
  assert.match(totpUri("ABC","admin@example.com"),/^otpauth:\/\/totp\//);
});
