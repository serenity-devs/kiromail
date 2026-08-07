import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { decryptSecret, encryptSecret } from "./secrets";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let result = "";
  for (let index = 0; index < bits.length; index += 5) result += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  return result;
}

function base32Decode(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Secreto TOTP no válido");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number) {
  const value = Buffer.alloc(8);
  value.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(value).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function verifyTotp(secret: string, candidate: string, now = Date.now()) {
  const normalized = candidate.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const counter = Math.floor(now / 30_000);
  return [-1, 0, 1].some((offset) => {
    const expected = hotp(secret, counter + offset);
    const left = Buffer.from(expected);
    const right = Buffer.from(normalized);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

export function totpUri(secret: string, email: string, issuer = "Serenity Mail") {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export async function totpSetup(secret: string, email: string) {
  const uri = totpUri(secret, email);
  return { secret, uri, qr_data_url: await QRCode.toDataURL(uri, { width: 240, margin: 1, errorCorrectionLevel: "M" }) };
}

export function encryptTotpSecret(secret: string) {
  return encryptSecret(secret);
}

export function decryptTotpSecret(secret: string) {
  return decryptSecret(secret);
}

function recoveryHash(code: string) {
  return createHash("sha256").update(`serenity-mfa:${code.trim().toUpperCase()}`).digest("hex");
}

export function generateRecoveryCodes(count = 8) {
  const codes = Array.from({ length: count }, () => `${randomBytes(4).toString("hex").slice(0, 4)}-${randomBytes(4).toString("hex").slice(0, 4)}`.toUpperCase());
  return { codes, hashes: codes.map(recoveryHash) };
}

export function matchRecoveryCode(hashes: string[], candidate: string) {
  const hash = recoveryHash(candidate);
  const index = hashes.findIndex((value) => {
    const left = Buffer.from(value);
    const right = Buffer.from(hash);
    return left.length === right.length && timingSafeEqual(left, right);
  });
  return index;
}
