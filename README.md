# Inkwell

A small, self-hosted dashboard for [Excalidraw](https://excalidraw.com/) scenes,
built to run entirely on Cloudflare. Scene blobs live in **R2**, the metadata
index lives in **D1**, and a single **Worker** serves both the React SPA and
the API. No servers to babysit, no egress fees.

> **Honoring the work this stands on.** Inkwell is just a thin wrapper around
> the wonderful [Excalidraw](https://github.com/excalidraw/excalidraw) editor
> — all the actual drawing, the hand-drawn aesthetic, the interaction model,
> and the file format are theirs. This project only adds: persistent storage,
> a multi-scene dashboard, and share links. If you like Inkwell, the credit
> belongs upstream; please consider supporting [Excalidraw+](https://plus.excalidraw.com/)
> or contributing to the open-source project.
>
> Design ideas were also borrowed (with thanks) from
> [ExcaliDash](https://github.com/ZimengXiong/ExcaliDash) (dashboard UX,
> SVG-thumbnail pattern, image-status normalization),
> [excalidraw-persist](https://github.com/ozencb/excalidraw-persist)
> (debounced autosave shape), and
> [excalidraw-full](https://github.com/BetterAndBetterII/excalidraw-full)
> (the "store the raw blob, index the metadata" split).

## Why this exists

The free Excalidraw web app keeps your drawings in browser local storage —
one canvas at a time. Excalidraw+ solves the multi-scene problem but is a
hosted paid product. The existing self-hosted alternatives are great but
either bring more infrastructure than I want (Postgres, Docker Compose,
collaboration servers) or don't speak Cloudflare's storage primitives.

Inkwell is the smallest thing that could possibly be: **"my Excalidraw, with
many saved scenes, on Cloudflare."**

## Architecture

```
Browser (React + @excalidraw/excalidraw)
   │
   │  fetch (HttpOnly cookie session)
   ▼
Cloudflare Worker  ──►  R2  scenes/{owner}/{id}.json   (full blob: elements + appState + files)
   │                ──►  R2  thumbs/{owner}/{id}.svg   (client-rendered SVG thumbnail)
   │                ──►  D1  scenes(id, owner, name, version, size_bytes, has_thumb, ...)
   │                ──►  D1  share_tokens(token, scene_id, permission, expires_at)
```

Key choices:

- **R2 holds the bytes, D1 holds the index.** Listing the dashboard never
  hits R2 — D1 returns metadata in milliseconds. R2 is only touched on open
  and save.
- **Optimistic concurrency via an integer `version` column.** Saves carry
  `If-Match: "<version>"`; mismatch returns 409 and the client refreshes.
- **Client-side SVG thumbnails.** `exportToSvg` runs on a 30s debounce after
  edits and writes a tiny SVG to R2. No server-side rendering required.
- **Email + password auth, HMAC-cookie sessions, invitation-only signup.**
  A super-admin is bootstrapped from `SUPER_ADMIN_EMAIL` /
  `SUPER_ADMIN_PASSWORD` env vars on first login. Further accounts are
  created via single-use invite links generated from the admin dashboard.
- **Static SPA served by the Worker via the [assets] binding.** One deploy
  unit, one URL.

## Project layout

```
inkwell/
├── wrangler.toml           # Worker config + R2/D1/assets bindings
├── schema.sql              # D1 schema (run once via `pnpm run db:init:remote`)
├── package.json
├── vite.config.ts          # SPA build; dev-time proxy of /api → wrangler
├── tsconfig*.json
├── index.html
├── src/                    # React frontend
│   ├── main.tsx
│   ├── App.tsx             # router + auth probe
│   ├── api.ts              # typed fetch wrapper
│   ├── styles.css
│   ├── hooks/useDebounced.ts
│   ├── components/SceneEditor.tsx   # the Excalidraw mount + autosave loop
│   └── pages/
│       ├── Login.tsx
│       ├── InviteAccept.tsx        # /invite/:token landing
│       ├── Account.tsx             # change-password page
│       ├── Admin.tsx               # users + invites dashboard
│       ├── Dashboard.tsx
│       ├── Editor.tsx              # owner editor (auth)
│       └── SharedEditor.tsx        # share-token editor
└── worker/                 # Cloudflare Worker
    ├── index.ts            # routes + asset fallback + CORS
    ├── auth.ts             # HMAC-cookie sessions + super-admin bootstrap
    ├── passwords.ts        # PBKDF2-SHA-256 hash + verify
    ├── users.ts            # admin user-management endpoints
    ├── invites.ts          # invite token endpoints
    ├── scenes.ts           # CRUD + thumbnail
    ├── share.ts            # share tokens
    ├── types.ts
    └── util.ts
```

## Setup

Prerequisites: Node 20+, a Cloudflare account, [wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/).

```bash
cd inkwell
pnpm install
wrangler login
```

### 1. Create the R2 bucket and D1 database

```bash
wrangler r2 bucket create excalidash
wrangler d1 create excalidash
```

Copy the `database_id` printed by `d1 create` into `wrangler.toml` (replace
`REPLACE_WITH_D1_DATABASE_ID`).

### 2. Apply the schema

```bash
pnpm run db:init:remote   # production
pnpm run db:init:local    # local dev (uses Miniflare's sqlite)
```

### 3. Set secrets

```bash
wrangler secret put SUPER_ADMIN_EMAIL     # email used to claim the first admin account
wrangler secret put SUPER_ADMIN_PASSWORD  # initial password for the super-admin
wrangler secret put SESSION_SECRET        # 32+ random bytes; e.g. `openssl rand -hex 32`
```

The super-admin row is created lazily on the first login attempt that
matches `SUPER_ADMIN_EMAIL` and supplies the matching password. After
that, the admin manages their password from the UI; the env vars stay as
break-glass and are only consulted again if no row exists for that
email.

For local dev, put the same values in a `.dev.vars` file:

```
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=changeme
SESSION_SECRET=devsecretdevsecretdevsecretdevse
```

### 4. Develop

In two terminals:

```bash
pnpm run dev:worker   # wrangler dev → :8787
pnpm run dev          # vite          → :5173 (proxies /api to :8787)
```

Open <http://localhost:5173>. Log in with `SUPER_ADMIN_EMAIL` and
`SUPER_ADMIN_PASSWORD`, click **+ New scene**.

To invite another user: click the avatar in the top-right → **Admin** →
**Invites** → **Create invite link**. Share the URL out of band; the
recipient registers with any email + password they like. Invites are
single-use, expire after the period you pick, and can be revoked at any
time from the same panel.

### 5. Deploy

```bash
pnpm run deploy
```

This runs `vite build` then `wrangler deploy`. The Worker takes over from
there; the SPA is served from R2's [assets] binding under the same origin as
the API.

## API

Endpoints under `/api/scenes/*`, `/api/me*`, and `/api/admin/*` require a
valid session cookie (admin routes additionally require `is_admin`).
`/api/share/*` and `/api/invites/*` are public — the token is the credential.

### Auth & profile

| Method | Path                          | Notes                                                |
| ------ | ----------------------------- | ---------------------------------------------------- |
| POST   | `/api/auth/login`             | `{ email, password }` → sets cookie, returns user     |
| POST   | `/api/auth/logout`            | clears cookie                                         |
| GET    | `/api/me`                     | session probe; returns `{ id, email, firstName, … }` |
| POST   | `/api/me/password`            | `{ currentPassword, newPassword }`                    |

### Invites

| Method | Path                                  | Notes                                                  |
| ------ | ------------------------------------- | ------------------------------------------------------ |
| GET    | `/api/invites/:token`                 | validate (200 ok / 404 / 410)                          |
| POST   | `/api/invites/:token/accept`          | `{ email, password, firstName, lastName }` → sets cookie |

### Admin (requires admin session)

| Method | Path                                  | Notes                                                  |
| ------ | ------------------------------------- | ------------------------------------------------------ |
| GET    | `/api/admin/users`                    | list users with scene counts                           |
| PATCH  | `/api/admin/users/:id`                | `{ isAdmin?, disabled?, firstName?, lastName? }`        |
| DELETE | `/api/admin/users/:id`                | hard delete + cascade scenes/R2/share-tokens           |
| GET    | `/api/admin/invites`                  | list all invites with status                           |
| POST   | `/api/admin/invites`                  | `{ expiresInHours? }` (null = never expire)             |
| DELETE | `/api/admin/invites/:token`           | revoke                                                  |

### Scenes & shares

| Method | Path                                  | Notes                                   |
| ------ | ------------------------------------- | --------------------------------------- |
| GET    | `/api/scenes`                         | list (D1 query, no R2 hits)             |
| POST   | `/api/scenes`                         | `{ name? }` → creates empty scene       |
| GET    | `/api/scenes/:id`                     | scene blob; `ETag: "<version>"`         |
| PUT    | `/api/scenes/:id`                     | full blob; supports `If-Match`          |
| PATCH  | `/api/scenes/:id`                     | `{ name }` rename                       |
| DELETE | `/api/scenes/:id`                     | also drops thumbnail and share tokens   |
| GET    | `/api/scenes/:id/thumb`               | SVG                                     |
| PUT    | `/api/scenes/:id/thumb`               | SVG (client-generated)                  |
| GET    | `/api/scenes/:id/shares`              | list active share tokens                |
| POST   | `/api/scenes/:id/shares`              | `{ permission: "read"\|"write" }`        |
| DELETE | `/api/scenes/:id/shares/:token`       | revoke                                  |
| GET    | `/api/share/:token`                   | scene blob via share link               |
| PUT    | `/api/share/:token`                   | save via share link (write tokens only) |
| GET    | `/api/share/:token/thumb`             | SVG via share link                      |

## Costs

For a personal instance (~hundreds of scenes, infrequent saves):

| Resource | Free tier | Realistic monthly cost |
|----------|-----------|------------------------|
| Workers requests | 100k/day | $0 |
| R2 storage       | 10 GB    | $0 (likely under) |
| R2 Class A ops   | 1M/mo    | $0 |
| D1 reads/writes  | 5M reads, 100k writes/day | $0 |

Egress on R2 is free, so even sharing scenes publicly doesn't add cost.

## Limitations

- **No real-time collaboration.** Adding live multi-cursor would mean a
  Durable Object per scene + a CRDT or OT layer. Out of scope for v1.
- **No password recovery flow.** If a user forgets their password, an
  admin can disable the account and re-issue an invite (the new account
  will be a fresh row; there's no email-bound reset).
- **Last-write-wins across tabs.** The `version` column catches the common
  case (one tab saved while another was editing) and refreshes; it doesn't
  attempt to merge.

## License

Inkwell is MIT. Excalidraw itself is MIT-licensed by the Excalidraw authors —
all credit for the drawing experience belongs to them.
