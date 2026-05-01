-- D1 schema for Inkwell.
-- Apply with:
--   npm run db:init:local    (local dev DB)
--   npm run db:init:remote   (production)
--
-- Tables:
--   users         -- account records (email + password hash, names, flags)
--   invites       -- single-use, time-limited registration tokens
--   scenes        -- metadata index for scene blobs in R2
--   share_tokens  -- per-scene share links
--
-- Note: D1 does not enforce foreign keys by default. The `REFERENCES` clauses
-- below are kept for documentation; cascading deletes are enforced in
-- application code (see `worker/users.ts::deleteUserCascade`).

-- ─── Users ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,           -- 16 hex chars (newId())
  email          TEXT NOT NULL UNIQUE,       -- stored lowercased
  password_hash  TEXT NOT NULL,              -- pbkdf2$sha256$<iters>$<saltb64>$<hashb64>
  first_name     TEXT NOT NULL DEFAULT '',
  last_name      TEXT NOT NULL DEFAULT '',
  is_admin       INTEGER NOT NULL DEFAULT 0, -- 0/1 boolean
  disabled       INTEGER NOT NULL DEFAULT 0, -- 0/1 boolean
  created_at     INTEGER NOT NULL,           -- unix ms
  updated_at     INTEGER NOT NULL,           -- unix ms
  last_login_at  INTEGER                     -- nullable; unix ms
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users (email);

-- ─── Invites ──────────────────────────────────────────────────────────
-- Stateful, single-use, optionally-expiring tokens. Not bound to a specific
-- email — whoever opens the link can register with any email.
CREATE TABLE IF NOT EXISTS invites (
  token             TEXT PRIMARY KEY,        -- 32 url-safe chars
  created_by        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at        INTEGER NOT NULL,        -- unix ms
  expires_at        INTEGER,                 -- nullable; unix ms
  used_by_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  used_at           INTEGER,                 -- nullable; unix ms
  revoked_at        INTEGER                  -- nullable; unix ms; admin-set
);

CREATE INDEX IF NOT EXISTS invites_created_by ON invites (created_by);
CREATE INDEX IF NOT EXISTS invites_unused     ON invites (used_at);

-- ─── Scenes ───────────────────────────────────────────────────────────
-- The full scene blob (elements + appState + files) lives in R2 at
-- scenes/{id}.json; this table holds metadata for fast listing.
CREATE TABLE IF NOT EXISTS scenes (
  id          TEXT PRIMARY KEY,              -- 16 hex chars (newId())
  owner       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Untitled',
  version     INTEGER NOT NULL DEFAULT 1,    -- bumped every PUT; used for If-Match
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  has_thumb   INTEGER NOT NULL DEFAULT 0,    -- 0/1 boolean
  created_at  INTEGER NOT NULL,              -- unix ms
  updated_at  INTEGER NOT NULL               -- unix ms
);

CREATE INDEX IF NOT EXISTS scenes_owner_updated
  ON scenes (owner, updated_at DESC);

-- Optional name search (LIKE-friendly). Cheap on small datasets; switch to FTS5
-- if you ever have thousands of scenes per user.
CREATE INDEX IF NOT EXISTS scenes_owner_name
  ON scenes (owner, name);

-- ─── Share tokens ─────────────────────────────────────────────────────
-- A scene can have many tokens (e.g. one read-only public link and one
-- read-write link for a collaborator).
CREATE TABLE IF NOT EXISTS share_tokens (
  token       TEXT PRIMARY KEY,              -- random 24+ char url-safe string
  scene_id    TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  permission  TEXT NOT NULL DEFAULT 'read',  -- 'read' | 'write'
  created_at  INTEGER NOT NULL,              -- unix ms
  expires_at  INTEGER                        -- nullable; unix ms
);

CREATE INDEX IF NOT EXISTS share_tokens_scene
  ON share_tokens (scene_id);
