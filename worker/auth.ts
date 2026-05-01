// Single-user auth via a shared password and an HMAC-signed cookie.
//
// The model is deliberately simple: one password for the whole instance,
// stored as a Worker secret (AUTH_PASSWORD). On successful /login we set a
// cookie containing `<owner>.<expiresAtMs>.<hmac>` signed with SESSION_SECRET.
// Every authenticated request verifies the HMAC and expiry.
//
// This is enough for self-hosting one person's drawings. To grow into
// multi-user later, swap `validateSession` for a real OIDC/OAuth flow and
// keep the same `owner` string in the rest of the codebase.

import type { Env } from "./types";
import { base64url, fromBase64url, timingSafeEqual } from "./util";

const COOKIE_NAME = "inkwell_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_OWNER = "default";

export interface Session {
  owner: string;
  expiresAt: number;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64url(new Uint8Array(sig));
}

export async function createSessionCookie(env: Env, owner = DEFAULT_OWNER): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${owner}.${expiresAt}`;
  const sig = await hmac(env.SESSION_SECRET, payload);
  const value = `${payload}.${sig}`;
  // SameSite=Lax is fine — the API is same-origin with the SPA.
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; Secure`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

export async function validateSession(req: Request, env: Env): Promise<Session | null> {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  const value = match[1];
  const lastDot = value.lastIndexOf(".");
  if (lastDot < 0) return null;

  const payload = value.slice(0, lastDot);
  const sig = value.slice(lastDot + 1);
  const expected = await hmac(env.SESSION_SECRET, payload);
  if (!timingSafeEqual(sig, expected)) return null;

  const [owner, expiresAtStr] = payload.split(".");
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  if (!owner) return null;

  return { owner, expiresAt };
}

export async function checkPassword(env: Env, password: string): Promise<boolean> {
  if (!env.AUTH_PASSWORD) return false;
  // Use HMAC-based comparison to avoid leaking length via plain string compare.
  const a = await hmac(env.SESSION_SECRET, password);
  const b = await hmac(env.SESSION_SECRET, env.AUTH_PASSWORD);
  return timingSafeEqual(a, b);
}

// Touch the unused import to keep tree-shakers happy.
void fromBase64url;
