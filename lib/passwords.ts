import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const keyLength = 32;
const cost = 16384;
const blockSize = 8;
const parallelization = 1;

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, keyLength, { N: cost, r: blockSize, p: parallelization, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}

export function passwordIsStrong(password: string) {
  return password.length >= 12 && password.length <= 512;
}

export async function hashPassword(password: string) {
  if (!passwordIsStrong(password)) throw new Error("La contraseña debe tener entre 12 y 512 caracteres");
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt$${cost}$${blockSize}$${parallelization}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, storedCost, storedBlockSize, storedParallelization, saltValue, hashValue] = stored.split("$");
  const validFormat = algorithm === "scrypt" && Boolean(saltValue) && Boolean(hashValue) && Number(storedCost) === cost && Number(storedBlockSize) === blockSize && Number(storedParallelization) === parallelization;
  try {
    const expected = validFormat ? Buffer.from(hashValue, "base64url") : Buffer.alloc(keyLength);
    const actual = await derive(password, validFormat ? Buffer.from(saltValue, "base64url") : Buffer.alloc(16, 83));
    return validFormat && expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
