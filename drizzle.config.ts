// Drizzle Kit configuration.
//
// Schema lives in `worker/db/schema.ts` and is the single source of truth.
// Migrations are generated with `pnpm db:generate` into `./drizzle/` and
// applied via `wrangler d1 migrations apply` (which records them in D1's
// `d1_migrations` table). We never use `drizzle-kit push` or `migrate` —
// those would require Cloudflare API credentials and bypass wrangler's
// tracking.

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./worker/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  verbose: true,
  strict: true,
});
