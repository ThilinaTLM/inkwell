-- D1 schema for Inkwell.
-- Apply with:
--   pnpm run db:init:local    (local dev DB)
--   pnpm run db:init:remote   (production)
--
-- Tables:
--   users         -- account records (email + password hash, names, flags)
--   invites       -- single-use, time-limited registration tokens
--   folders       -- per-user nested folders; one is_default Inbox per user
--   scenes        -- metadata index for scene blobs in R2; lives in a folder
--   tags          -- per-user tag namespace (shared by scenes and folders)
--   taggings      -- polymorphic tag <-> (scene|folder) join
--   shares        -- public, anonymous tokens against a scene OR folder
--
-- D1 enforces foreign keys when `PRAGMA foreign_keys = ON;` is set per
-- connection. The `REFERENCES` clauses below describe the intent. Worker
-- code additionally cleans up R2 objects (which D1 cannot touch).
--
-- Idempotency: every CREATE uses `IF NOT EXISTS`. Use the migrations/
-- folder for upgrades that mutate existing rows or drop legacy tables.

PRAGMA foreign_keys = ON;

-- ─── Users ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,           -- 16 hex chars (newId())
  email          TEXT NOT NULL UNIQUE,       -- stored lowercased
  password_hash  TEXT NOT NULL,              -- pbkdf2$sha256$<iters>$<saltb64>$<hashb64>
  first_name     TEXT NOT NULL DEFAULT '',
  last_name      TEXT NOT NULL DEFAULT '',
  is_admin       INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  disabled       INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
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

-- ─── Folders ──────────────────────────────────────────────────────────
-- Per-user nested folders. `parent_id IS NULL` means a top-level folder.
-- Each user has exactly one folder with `is_default = 1` (the Inbox), which
-- the API auto-creates on first authenticated request and refuses to
-- rename or delete.
--
-- Cycle prevention and depth limits (max 8) are enforced in app code on
-- create/move; the self-loop CHECK below is a cheap last-resort guard.
CREATE TABLE IF NOT EXISTS folders (
  id          TEXT PRIMARY KEY,              -- 16 hex chars
  owner       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES folders(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  CHECK (length(name) BETWEEN 1 AND 200),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

-- Hot path: list children of a folder, list roots, sort by name.
CREATE INDEX IF NOT EXISTS folders_owner_parent
  ON folders (owner, parent_id, name);

-- Exactly one Inbox per user.
CREATE UNIQUE INDEX IF NOT EXISTS folders_owner_default
  ON folders (owner) WHERE is_default = 1;

-- ─── Scenes ───────────────────────────────────────────────────────────
-- The full scene blob (elements + appState + files) lives in R2 at
-- scenes/{id}.json; this table holds metadata for fast listing.
--
-- `folder_id` is nominally nullable so SQLite ALTER TABLE works on
-- existing rows; the API guarantees it is always set. Any scene found
-- with `folder_id IS NULL` is migrated to that owner's Inbox on next
-- read (see `worker/folders.ts::ensureInbox`).
CREATE TABLE IF NOT EXISTS scenes (
  id          TEXT PRIMARY KEY,
  owner       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id   TEXT REFERENCES folders(id) ON DELETE SET NULL,
  name        TEXT NOT NULL DEFAULT 'Untitled',
  version     INTEGER NOT NULL DEFAULT 1,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  has_thumb   INTEGER NOT NULL DEFAULT 0 CHECK (has_thumb IN (0, 1)),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  CHECK (length(name) BETWEEN 1 AND 200)
);

-- Hot path: dashboard list within a folder.
CREATE INDEX IF NOT EXISTS scenes_owner_folder_updated
  ON scenes (owner, folder_id, updated_at DESC);

-- "All my scenes by recency" (the 'All scenes' view).
CREATE INDEX IF NOT EXISTS scenes_owner_updated
  ON scenes (owner, updated_at DESC);

-- LIKE-friendly name search.
CREATE INDEX IF NOT EXISTS scenes_owner_name
  ON scenes (owner, name);

-- ─── Tags ─────────────────────────────────────────────────────────────
-- One tag namespace per user, shared by scenes and folders.
-- `name` is normalized in app code: trim().toLowerCase(), max 50 chars.
CREATE TABLE IF NOT EXISTS tags (
  id          TEXT PRIMARY KEY,              -- 16 hex chars
  owner       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  CHECK (length(name) BETWEEN 1 AND 50)
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_owner_name ON tags (owner, name);

-- Polymorphic join: a tag attached to either a scene or a folder.
-- `target_id` is unconstrained at the SQL level (no FK across two possible
-- tables); the application enforces consistency and cleans up taggings
-- when scenes/folders are deleted.
CREATE TABLE IF NOT EXISTS taggings (
  tag_id       TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('scene', 'folder')),
  target_id    TEXT NOT NULL,
  owner        TEXT NOT NULL,                 -- denormalized; matches tag.owner
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (tag_id, target_type, target_id)
);

-- "Tags for this scene/folder" — primary read pattern when rendering cards.
CREATE INDEX IF NOT EXISTS taggings_target
  ON taggings (target_type, target_id);

-- "All tags for this owner" — sidebar list with counts.
CREATE INDEX IF NOT EXISTS taggings_owner_tag
  ON taggings (owner, tag_id);

-- ─── Shares ───────────────────────────────────────────────────────────
-- Polymorphic public share tokens. Each row grants anonymous,
-- token-authenticated access to a scene OR a folder subtree, at read or
-- write permission.
--
-- Lifecycle: a share is "active" when not revoked and not expired.
-- `last_accessed_at` is updated best-effort via ctx.waitUntil on each
-- token resolve.
CREATE TABLE IF NOT EXISTS shares (
  token            TEXT PRIMARY KEY,          -- 24+ url-safe chars
  owner            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type      TEXT NOT NULL CHECK (target_type IN ('scene', 'folder')),
  target_id        TEXT NOT NULL,
  permission       TEXT NOT NULL CHECK (permission IN ('read', 'write')),
  allow_download   INTEGER NOT NULL DEFAULT 1 CHECK (allow_download IN (0, 1)),
  label            TEXT,                      -- nullable human label
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER,                   -- nullable
  revoked_at       INTEGER,                   -- nullable
  last_accessed_at INTEGER                    -- nullable
);

-- "List my shares" (admin/dashboard).
CREATE INDEX IF NOT EXISTS shares_owner_created
  ON shares (owner, created_at DESC);

-- "Active shares for this scene/folder" (cleanup on delete).
CREATE INDEX IF NOT EXISTS shares_target
  ON shares (target_type, target_id);
