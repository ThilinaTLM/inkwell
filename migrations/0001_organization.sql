-- Migration 0001 — Scene organization (folders, tags, polymorphic shares).
--
-- Forward-only. Idempotent on each statement. Apply with:
--   pnpm run db:migrate:remote   (production)
--   pnpm run db:migrate:local    (local dev)
--
-- Notes for D1:
--   * D1 supports `WITH RECURSIVE`, partial indexes, CHECK constraints,
--     and `ALTER TABLE ... ADD COLUMN`. It does NOT support
--     `ALTER TABLE ... DROP COLUMN` or `ADD CONSTRAINT`.
--   * `INSERT OR IGNORE` is used where a re-run might collide.

PRAGMA foreign_keys = ON;

-- 1. Folders (per-user nested).
CREATE TABLE IF NOT EXISTS folders (
  id          TEXT PRIMARY KEY,
  owner       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES folders(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  CHECK (length(name) BETWEEN 1 AND 200),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX IF NOT EXISTS folders_owner_parent ON folders (owner, parent_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS folders_owner_default
  ON folders (owner) WHERE is_default = 1;

-- 2. Tags + taggings (polymorphic).
CREATE TABLE IF NOT EXISTS tags (
  id          TEXT PRIMARY KEY,
  owner       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  CHECK (length(name) BETWEEN 1 AND 50)
);
CREATE UNIQUE INDEX IF NOT EXISTS tags_owner_name ON tags (owner, name);

CREATE TABLE IF NOT EXISTS taggings (
  tag_id       TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('scene', 'folder')),
  target_id    TEXT NOT NULL,
  owner        TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (tag_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS taggings_target    ON taggings (target_type, target_id);
CREATE INDEX IF NOT EXISTS taggings_owner_tag ON taggings (owner, tag_id);

-- 3. Polymorphic shares table.
CREATE TABLE IF NOT EXISTS shares (
  token            TEXT PRIMARY KEY,
  owner            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type      TEXT NOT NULL CHECK (target_type IN ('scene', 'folder')),
  target_id        TEXT NOT NULL,
  permission       TEXT NOT NULL CHECK (permission IN ('read', 'write')),
  allow_download   INTEGER NOT NULL DEFAULT 1 CHECK (allow_download IN (0, 1)),
  label            TEXT,
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER,
  revoked_at       INTEGER,
  last_accessed_at INTEGER
);
CREATE INDEX IF NOT EXISTS shares_owner_created ON shares (owner, created_at DESC);
CREATE INDEX IF NOT EXISTS shares_target        ON shares (target_type, target_id);

-- 4. Add scenes.folder_id (no-op if already added).
--    SQLite errors if the column exists; D1 surfaces that as a row error.
--    We keep this in a single statement so it's clearly the only mutating
--    schema change; for re-runs, comment out manually or wrap in a fresh
--    migration file.
ALTER TABLE scenes ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS scenes_owner_folder_updated
  ON scenes (owner, folder_id, updated_at DESC);

-- 5. Migrate share_tokens → shares (only matters if share_tokens still exists).
--    Map scene_id → target_id, target_type='scene', allow_download=1, owner
--    derived from the scene row. INSERT OR IGNORE so a partial re-run is safe.
INSERT OR IGNORE INTO shares
  (token, owner, target_type, target_id, permission, allow_download, label,
   created_at, expires_at, revoked_at, last_accessed_at)
SELECT
  st.token,
  s.owner,
  'scene',
  st.scene_id,
  st.permission,
  1,
  NULL,
  st.created_at,
  st.expires_at,
  NULL,
  NULL
FROM share_tokens st
JOIN scenes s ON s.id = st.scene_id;

-- 6. Drop the legacy table once rows are migrated.
DROP TABLE IF EXISTS share_tokens;
