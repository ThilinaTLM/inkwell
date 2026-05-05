// Tiny helpers shared across handlers.

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, { status });
}

// 16-char crockford-base32-ish id (96 bits of randomness). Short, URL-safe,
// no ambiguous chars. Used for file ids.
const ID_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
export function newId(len = 16): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b & 31];
  return out;
}

// Longer token for share links (~144 bits).
export function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export function base64url(bytes: Uint8Array): string {
  const s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function now(): number {
  return Date.now();
}

// ─── Petname label generator for share links ─────────────────────
// Used as the default `shares.label` when the owner doesn't type one,
// so each link has a memorable display identity ("amber-fox-37")
// instead of falling back to "Untitled link" in the dialog. The label
// is purely cosmetic; the URL token (`shares.token`) remains a
// cryptographically random 144-bit value — do NOT confuse the two.
//
// Word lists are curated to fit the Inkwell aesthetic (warm,
// paper-and-ink, nature) and avoid negative/loaded vocabulary. ~30
// adjectives × ~30 nouns × 100 numeric suffixes = ~90k unique
// combinations — plenty to keep two shares on the same target visually
// distinct, without needing per-account uniqueness checks.
const PETNAME_ADJECTIVES = [
  "amber",
  "ashen",
  "brass",
  "calm",
  "cedar",
  "copper",
  "dusty",
  "ember",
  "faded",
  "gentle",
  "hazy",
  "indigo",
  "ivory",
  "linen",
  "lush",
  "mellow",
  "misty",
  "mossy",
  "ochre",
  "paper",
  "plum",
  "quiet",
  "rustic",
  "sable",
  "sepia",
  "silken",
  "sunny",
  "umber",
  "vellum",
  "warm",
  "willow",
];
const PETNAME_NOUNS = [
  "arc",
  "birch",
  "brook",
  "cedar",
  "cove",
  "dale",
  "dune",
  "fern",
  "fox",
  "glade",
  "glen",
  "harbor",
  "heath",
  "hill",
  "isle",
  "lark",
  "lily",
  "marsh",
  "meadow",
  "moon",
  "oak",
  "owl",
  "pine",
  "pond",
  "reed",
  "river",
  "rose",
  "stone",
  "stream",
  "vine",
  "wren",
];

export function generateShareLabel(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const adj = PETNAME_ADJECTIVES[bytes[0] % PETNAME_ADJECTIVES.length];
  const noun = PETNAME_NOUNS[bytes[1] % PETNAME_NOUNS.length];
  const num = (bytes[2] % 100).toString().padStart(2, "0");
  return `${adj}-${noun}-${num}`;
}

// Constant-time string compare. Both args must be the same length to avoid
// leaking length; we pad the shorter side. Safe for short auth tokens.
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// Exhaustiveness guard for discriminated unions. A `default` branch that
// returns `assertNever(value)` will fail TS compilation if a new variant
// is added to the union without a matching case.
export function assertNever(value: never): never {
  throw new Error(`unhandled variant: ${String(value)}`);
}
