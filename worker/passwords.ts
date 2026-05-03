// Password hashing using PBKDF2-SHA-256 via the Web Crypto API (native to
// Workers — no WASM, no extra deps).
//
// Encoded format:  pbkdf2$sha256$<iters>$<saltb64url>$<hashb64url>
//
// Storing iterations and salt in the encoded string keeps us forward-
// compatible: we can bump iteration counts later and `verifyPassword` will
// still work for older rows. To rotate to a different KDF (argon2, scrypt)
// later, branch on the leading scheme tag.

import { base64url, fromBase64url, timingSafeEqual } from "./util";

// Cloudflare Workers caps PBKDF2 iterations at 100,000 (NotSupportedError
// is thrown for higher values). OWASP currently recommends 600,000 for
// PBKDF2-SHA-256 in 2023+, but on Workers we are forced down to the
// platform ceiling. The encoded hash records the iteration count, so if
// Cloudflare ever raises the limit we can bump this and old rows still
// verify. To rotate to a stronger KDF later (e.g. scrypt via WASM) branch
// on the leading scheme tag.
const DEFAULT_ITERS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

export async function hashPassword(plain: string, iters = DEFAULT_ITERS): Promise<string> {
  if (typeof plain !== "string" || plain.length === 0) {
    throw new Error("password must be a non-empty string");
  }
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const derived = await pbkdf2(plain, salt, iters, HASH_BYTES);
  return `pbkdf2$sha256$${iters}$${base64url(salt)}$${base64url(derived)}`;
}

export async function verifyPassword(plain: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 5) return false;
  const [scheme, hash, itersStr, saltB64, expectedB64] = parts;
  if (scheme !== "pbkdf2" || hash !== "sha256") return false;
  const iters = Number(itersStr);
  if (!Number.isFinite(iters) || iters <= 0 || iters > 5_000_000) return false;

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64url(saltB64);
    expected = fromBase64url(expectedB64);
  } catch {
    return false;
  }

  const derived = await pbkdf2(plain, salt, iters, expected.byteLength);
  return timingSafeEqualBytes(derived, expected);
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
  byteLen: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    byteLen * 8,
  );
  return new Uint8Array(bits);
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  // Compare via stringified char codes so we can reuse `timingSafeEqual`.
  // Both sides come from PBKDF2 with a known length, but the helper guards
  // against length mismatches anyway.
  if (a.byteLength !== b.byteLength) return false;
  let aStr = "";
  let bStr = "";
  for (let i = 0; i < a.byteLength; i++) {
    aStr += String.fromCharCode(a[i]);
    bStr += String.fromCharCode(b[i]);
  }
  return timingSafeEqual(aStr, bStr);
}
