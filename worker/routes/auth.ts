// Public auth routes: login + logout.
//
// Mounted at `/api/auth`. Login bootstraps the super-admin on first
// run (see worker/auth.ts).

import { Hono } from "hono";
import { clearSessionCookie, createSessionCookie, loginWithPassword } from "../auth";
import { errorResponse, jsonResponse } from "../lib/responses";
import { parseJson } from "../middleware/body";
import type { AppEnv } from "../middleware/types";

const r = new Hono<AppEnv>();

interface LoginBody {
  email?: string;
  password?: string;
}

r.post("/login", async (c) => {
  const body = await parseJson<LoginBody>(c);
  if (body instanceof Response) return body;
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return errorResponse(400, "email and password required");

  const result = await loginWithPassword(c.env, email, password);
  if (!result.ok) {
    if (result.reason === "disabled") return errorResponse(403, "account disabled");
    if (result.reason === "misconfigured") {
      return errorResponse(500, "server misconfigured: SUPER_ADMIN_PASSWORD missing");
    }
    return errorResponse(401, "invalid email or password");
  }

  const cookie = await createSessionCookie(c.env, result.user.id);
  return jsonResponse(
    {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.first_name,
      lastName: result.user.last_name,
      isAdmin: result.user.is_admin,
    },
    {
      status: 200,
      headers: { "set-cookie": cookie },
    },
  );
});

r.post(
  "/logout",
  () =>
    new Response(null, {
      status: 204,
      headers: { "set-cookie": clearSessionCookie() },
    }),
);

export default r;
