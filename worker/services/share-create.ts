// Owner-side share creation helper.
//
// Used by `POST /api/files/:id/shares` and `POST /api/folders/:id/shares`.
// Encapsulates the body validation, label fallback, and row insert so
// both routes are short.

import * as sharesRepo from "../db/repos/shares";
import { newToken } from "../lib/crypto";
import { generateShareLabel } from "../lib/petname";
import { now } from "../lib/util";
import type { Env, SharePermission, ShareRow, ShareTargetType } from "../types";

export interface CreateShareBody {
  permission?: SharePermission;
  allowDownload?: boolean;
  expiresAt?: number | null;
  label?: string | null;
}

export async function createShareRow(
  env: Env,
  owner: string,
  targetType: ShareTargetType,
  targetId: string,
  body: CreateShareBody,
): Promise<ShareRow> {
  const permission: SharePermission = body.permission === "write" ? "write" : "read";
  // Write shares always allow download; read shares default to allowing it.
  const allowDownload = permission === "write" ? true : body.allowDownload !== false;
  const expiresAt =
    body.expiresAt !== undefined && body.expiresAt !== null && Number.isFinite(body.expiresAt)
      ? Number(body.expiresAt)
      : null;
  // The owner's label takes priority; if they didn't type one (or only
  // whitespace), fall back to a generated petname ("amber-fox-37") so
  // each row has a memorable identity in the dialog and on the /shares
  // page. Cosmetic only — the URL token is independent.
  const trimmedLabel = typeof body.label === "string" ? body.label.trim().slice(0, 200) : "";
  const label = trimmedLabel.length > 0 ? trimmedLabel : generateShareLabel();
  const token = newToken();
  const ts = now();
  const row: ShareRow = {
    token,
    owner,
    target_type: targetType,
    target_id: targetId,
    permission,
    allow_download: allowDownload,
    label,
    created_at: ts,
    expires_at: expiresAt,
    revoked_at: null,
    last_accessed_at: null,
  };
  await sharesRepo.insert(env, row);
  return row;
}
