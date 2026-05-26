# Inkwell

A small, self-hosted dashboard for [Excalidraw](https://excalidraw.com/) and
[draw.io](https://www.drawio.com/) diagrams, built to run entirely on
Cloudflare. File blobs live in **R2**, the metadata index lives in **D1**,
and a single **Worker** serves both the React SPA and the API. No servers
to babysit, no egress fees.

> **Honoring the work this stands on.** Inkwell is just a thin wrapper around
> the wonderful [Excalidraw](https://github.com/excalidraw/excalidraw) editor
> — all the actual drawing, the hand-drawn aesthetic, the interaction model,
> and the file format are theirs. This project only adds: persistent storage,
> a multi-file dashboard, and share links. If you like Inkwell, the credit
> belongs upstream; please consider supporting [Excalidraw+](https://plus.excalidraw.com/)
> or contributing to the open-source project.
>
> Design ideas were also borrowed (with thanks) from
> [ExcaliDash](https://github.com/ZimengXiong/ExcaliDash),
> [excalidraw-persist](https://github.com/ozencb/excalidraw-persist), and
> [excalidraw-full](https://github.com/BetterAndBetterII/excalidraw-full).

## Why this exists

The free Excalidraw web app keeps your drawings in browser local storage —
one canvas at a time. Excalidraw+ solves the multi-file problem but is a
hosted paid product. Inkwell is the smallest thing that could possibly be:
**"my Excalidraw and draw.io, with many saved files, organized in folders,
on Cloudflare."**

Features at a glance:

- Multi-file dashboard with **folders** (nested, per-user) and **tags**
- Four equal-priority file kinds today (Excalidraw, draw.io, Notes via
  [BlockNote](https://www.blocknotejs.org/), and **Static sites** for
  publishing uploaded HTML/CSS/JS bundles), more later
- **Share links** for individual files or whole folder subtrees, read or
  read-write, with optional expiry and downloads
- **Email + password auth**, invitation-only signup, super-admin bootstrap
- Client-rendered SVG thumbnails, debounced autosave, optimistic concurrency

## Architecture

```
Browser (React + @excalidraw/excalidraw)
   │
   │  fetch (HttpOnly cookie session)
   ▼
Cloudflare Worker  ──►  R2  file blobs + SVG thumbnails
                   ──►  D1  metadata index (users, folders, files, tags, shares)
```

Key choices:

- **R2 holds the bytes, D1 holds the index.** Listing the dashboard never
  hits R2 — D1 returns metadata in milliseconds. R2 is only touched on open
  and save.
- **Static-site files** are multi-asset bundles: the canonical JSON blob
  is a *manifest* listing every uploaded file, and each asset lives at
  `static-sites/{id}/{relpath}` in R2. The Worker serves them through a
  signed `/sites/...` (owner) and `/shared/...` (share-token) routes so uploaded JS
  cannot read session cookies or call `/api/*` as the owner. See
  [`worker/services/static-site.ts`](./worker/services/static-site.ts)
  and [`worker/routes/render.ts`](./worker/routes/render.ts).
- **Optimistic concurrency** via an integer `version` column and `If-Match`.
- **Client-side SVG thumbnails** (`exportToSvg` on a debounce). No
  server-side rendering required.
- **Static SPA served by the Worker via the `[assets]` binding.** One
  deploy unit, one URL.

The API surface lives under `/api/*` in [`worker/`](./worker); the SPA
lives in [`src/`](./src). Routes and schemas are the source of truth — see
the code rather than this README.

## Quick start

Prerequisites: Node 20+, pnpm, a Cloudflare account, and
[wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/).

```bash
pnpm install                     # also installs the repo Git hooks
pnpm drawio:assets               # optional but required for draw.io files
wrangler login

# 1. Provision storage
wrangler r2 bucket create inkwell
wrangler d1 create inkwell        # paste the printed database_id into wrangler.toml

# 2. Apply migrations
pnpm db:migrate:local              # local dev
pnpm db:migrate:remote             # production

# 3. Set secrets (production)
wrangler secret put SUPER_ADMIN_EMAIL
wrangler secret put SUPER_ADMIN_PASSWORD
wrangler secret put SESSION_SECRET   # 32+ random bytes; e.g. `openssl rand -hex 32`

# 4. Develop (two terminals)
pnpm dev:worker                    # wrangler dev
pnpm dev                           # vite

# 5. Deploy
pnpm drawio:assets               # ensure ./public/drawio exists before building
pnpm deploy
```

For local dev, copy `.dev.vars.example` to `.dev.vars` and adjust. The
super-admin row is created lazily on the first login attempt that matches
`SUPER_ADMIN_EMAIL` + `SUPER_ADMIN_PASSWORD`. Further accounts come in via
single-use invite links generated from the **Users** panel.

Draw.io support uses a pinned first-party static asset snapshot under
`public/drawio/`. That directory is intentionally git-ignored because the
upstream webapp is large; regenerate it with `pnpm drawio:assets` before a
build or deploy that needs draw.io editing.

See [`package.json`](./package.json) for the full script list.

## Costs

For a personal instance (hundreds of files, infrequent saves), expected
monthly cost is **$0** — Workers, R2, and D1 free tiers cover it
comfortably, and R2 has no egress fees.

## Limitations

- **No real-time collaboration.** Single-writer per file; last-write-wins
  across tabs (with a `version` check that catches the common case).
- **No password recovery flow.** Admins can re-issue an invite; there is
  no email-bound reset.

## License

Inkwell is licensed under the [Apache License 2.0](./LICENSE). Excalidraw
itself is MIT-licensed by the Excalidraw authors — all credit for the
drawing experience belongs to them.
