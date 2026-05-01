-- D1 schema for excalidash-cf.
-- Apply with:
--   npm run db:init:local    (local dev DB)
--   npm run db:init:remote   (production)

-- Scene index. The full scene blob (elements + appState + files) lives in R2 at
-- scenes/{owner}/{id}.json; this table only holds metadata for fast listing.
CREATE TABLE IF NOT EXISTS scenes (
  id          TEXT PRIMARY KEY,           -- ULID-ish (16 hex chars)
  owner       TEXT NOT NULL,              -- user id; "default" in single-user mode
  name        TEXT NOT NULL DEFAULT 'Untitled',
  version     INTEGER NOT NULL DEFAULT 1, -- bumped every PUT; used for If-Match
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  has_thumb   INTEGER NOT NULL DEFAULT 0, -- 0/1 boolean
  created_at  INTEGER NOT NULL,           -- unix ms
  updated_at  INTEGER NOT NULL            -- unix ms
);

CREATE INDEX IF NOT EXISTS scenes_owner_updated
  ON scenes (owner, updated_at DESC);

-- Optional name search (LIKE-friendly). Cheap on small datasets; switch to FTS5
-- if you ever have thousands of scenes per user.
CREATE INDEX IF NOT EXISTS scenes_owner_name
  ON scenes (owner, name);

-- Share tokens. A scene can have many tokens (e.g. one read-only public link
-- and one read-write link for a collaborator).
CREATE TABLE IF NOT EXISTS share_tokens (
  token       TEXT PRIMARY KEY,           -- random 24+ char url-safe string
  scene_id    TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  permission  TEXT NOT NULL DEFAULT 'read', -- 'read' | 'write'
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER                     -- nullable; unix ms
);

CREATE INDEX IF NOT EXISTS share_tokens_scene
  ON share_tokens (scene_id);
