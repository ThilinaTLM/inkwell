// Drizzle schema for Inkwell — single source of truth for the D1 database.
//
// Conventions:
//   * Column names are explicit snake_case so generated migration SQL matches
//     existing on-disk table layouts and so handlers can read columns by the
//     name they always had.
//   * Boolean flags use `integer({ mode: "boolean" })`. Drizzle stores them as
//     0/1 in SQLite and surfaces JS booleans to the application. We keep the
//     `CHECK (col IN (0, 1))` constraints as a defense-in-depth guard.
//   * Timestamps are unix-ms integers. App code calls `Date.now()`; we never
//     rely on SQLite's `CURRENT_TIMESTAMP`.
//   * IDs and tokens are app-generated random strings (see `worker/util.ts`).
//   * Polymorphic columns (`taggings.target_id`, `shares.target_id`) are
//     plain TEXT — there is no SQL-level FK because the target lives in one
//     of two tables. Application code is responsible for cleanup.
//
// FK enforcement: D1 honors FKs only when `PRAGMA foreign_keys = ON` is set
// per connection, which Drizzle does NOT do automatically. App code already
// cleans up dependents explicitly; the `references()` declarations below
// document intent and shape the generated DDL.

import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ─── users ────────────────────────────────────────────────────────────
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    password_hash: text("password_hash").notNull(),
    first_name: text("first_name").notNull().default(""),
    last_name: text("last_name").notNull().default(""),
    is_admin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
    last_login_at: integer("last_login_at"),
  },
  (t) => [
    uniqueIndex("users_email").on(t.email),
    check("users_is_admin_bool", sql`${t.is_admin} IN (0, 1)`),
    check("users_disabled_bool", sql`${t.disabled} IN (0, 1)`),
  ],
);

// ─── invites ──────────────────────────────────────────────────────────
// Single-use, optionally-expiring registration tokens. `created_by` cascades
// so deleting a user cleans up their invites; `used_by_user_id` is set-null
// so we keep the audit row when the inviter deletes themselves.
export const invites = sqliteTable(
  "invites",
  {
    token: text("token").primaryKey(),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    created_at: integer("created_at").notNull(),
    expires_at: integer("expires_at"),
    used_by_user_id: text("used_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    used_at: integer("used_at"),
    revoked_at: integer("revoked_at"),
  },
  (t) => [index("invites_created_by").on(t.created_by), index("invites_unused").on(t.used_at)],
);

// ─── folders ──────────────────────────────────────────────────────────
// Per-user nested folders. Cycle prevention and depth limits are enforced
// in app code; the self-loop CHECK is a last-resort guard. Folders may
// live at the literal root (`parent_id IS NULL`); there is no longer a
// per-user "Inbox" folder.
export const folders = sqliteTable(
  "folders",
  {
    id: text("id").primaryKey(),
    owner: text("owner")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parent_id: text("parent_id").references((): AnySQLiteColumn => folders.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => [
    // Hot path: list children of a folder, list roots, sort by name.
    index("folders_owner_parent").on(t.owner, t.parent_id, t.name),
    check("folders_name_len", sql`length(${t.name}) BETWEEN 1 AND 200`),
    check("folders_no_self_parent", sql`${t.parent_id} IS NULL OR ${t.parent_id} <> ${t.id}`),
  ],
);

// ─── files ────────────────────────────────────────────────────────────
// Metadata index for file blobs in R2. The R2 key prefix is still
// `scenes/{id}.json` for historical reasons (renaming would require a full
// blob copy with no user-visible payoff); the worker's `r2FileKey` helper
// documents that divergence. `folder_id` is nullable: `NULL` means "lives
// at the root level" (a top-level file with no parent folder); otherwise
// it points at a `folders.id`.
export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    owner: text("owner")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    folder_id: text("folder_id").references(() => folders.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull().default("Untitled"),
    kind: text("kind", { enum: ["excalidraw", "drawio"] })
      .notNull()
      .default("excalidraw"),
    version: integer("version").notNull().default(1),
    size_bytes: integer("size_bytes").notNull().default(0),
    has_thumb: integer("has_thumb", { mode: "boolean" }).notNull().default(false),
    // Cache-bust token for the thumbnail. Bumped to `now()` on every
    // successful `putThumb`. Decoupled from `version` (which represents
    // file blob content) and `updated_at` (which drives list ordering)
    // so a thumb re-upload doesn't pretend the file was edited.
    thumb_updated_at: integer("thumb_updated_at").notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => [
    // Hot path: dashboard list within a folder.
    index("files_owner_folder_updated").on(t.owner, t.folder_id, sql`${t.updated_at} DESC`),
    // "All my files by recency" (the 'All files' view).
    index("files_owner_updated").on(t.owner, sql`${t.updated_at} DESC`),
    // LIKE-friendly name search.
    index("files_owner_name").on(t.owner, t.name),
    check("files_name_len", sql`length(${t.name}) BETWEEN 1 AND 200`),
    check("files_has_thumb_bool", sql`${t.has_thumb} IN (0, 1)`),
  ],
);

// ─── tags ─────────────────────────────────────────────────────────────
// One tag namespace per user; `name` is normalized in app code.
export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    owner: text("owner")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    created_at: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("tags_owner_name").on(t.owner, t.name),
    check("tags_name_len", sql`length(${t.name}) BETWEEN 1 AND 50`),
  ],
);

// ─── taggings ─────────────────────────────────────────────────────────
// Polymorphic join: a tag attached to either a file or a folder. There is
// no FK on `target_id` because the target lives in one of two tables.
export const taggings = sqliteTable(
  "taggings",
  {
    tag_id: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    target_type: text("target_type", { enum: ["file", "folder"] }).notNull(),
    target_id: text("target_id").notNull(),
    owner: text("owner").notNull(),
    created_at: integer("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tag_id, t.target_type, t.target_id] }),
    // "Tags for this file/folder".
    index("taggings_target").on(t.target_type, t.target_id),
    // "All tags for this owner" — sidebar list with counts.
    index("taggings_owner_tag").on(t.owner, t.tag_id),
  ],
);

// ─── shares ───────────────────────────────────────────────────────────
// Public, anonymous tokens against a file OR a folder subtree.
export const shares = sqliteTable(
  "shares",
  {
    token: text("token").primaryKey(),
    owner: text("owner")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    target_type: text("target_type", { enum: ["file", "folder"] }).notNull(),
    target_id: text("target_id").notNull(),
    permission: text("permission", { enum: ["read", "write"] }).notNull(),
    allow_download: integer("allow_download", { mode: "boolean" }).notNull().default(true),
    label: text("label"),
    created_at: integer("created_at").notNull(),
    expires_at: integer("expires_at"),
    revoked_at: integer("revoked_at"),
    last_accessed_at: integer("last_accessed_at"),
  },
  (t) => [
    index("shares_owner_created").on(t.owner, sql`${t.created_at} DESC`),
    index("shares_target").on(t.target_type, t.target_id),
    check("shares_allow_download_bool", sql`${t.allow_download} IN (0, 1)`),
  ],
);
