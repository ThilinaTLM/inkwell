// Preview-redirect components for static-site files.
//
// Two flavors, one per access path:
//
//   * `StaticSitePreviewRedirect`         (owner, `/f/:id/site`)
//   * `SharedStaticSitePreviewRedirect`   (visitor, `/share/:token`
//                                          or `/share/:token/files/:fileId`)
//
// Both mint a short-lived signed URL prefix and `window.location.replace`
// to `prefix + manifest.entry`. We use `replace` (not assign) so the
// browser back button skips this bouncing entry.
//
// Why a stable URL rather than just an "Open in new tab" button in
// the management editor: signed `/sites/...` and `/shared/.../sig/...`
// URLs expire after 30 minutes, so they can't be bookmarked or pasted
// into chat. These routes are the bookmarkable canonical preview
// entry points — they mint a fresh session every visit.
//
// Access control:
//   * Owner path goes through `staticSites.renderSession(id)` and
//     `staticSites.manifest(id)`. Both 404 unless the caller owns the
//     file. Anonymous / wrong-user visitors land on the same error
//     state as a missing file. The signed `/sites/...` URL the
//     redirect targets ALSO requires session + ownership at the
//     worker layer (see `worker/routes/render.ts`); the sig is a
//     TTL-bound defense in depth.
//   * Share path goes through `shares.renderSession(token)` (file
//     share) or `shares.renderSessionForFile(token, fileId)` (folder
//     share). The share render-session endpoint re-checks the share
//     row, so revoked/expired shares produce a 403 here and surface
//     as an error state below.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, type StaticSiteFileBlob, shares, staticSites } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
import { EditorErrorState, EditorLoadingState } from "./EditorChrome";

// ─── Owner ────────────────────────────────────────────────────────

export function StaticSitePreviewRedirect() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        // Fetch manifest + signature in parallel — both are required
        // before we can build the redirect target.
        const [session, manifest] = await Promise.all([
          staticSites.renderSession(id),
          staticSites.manifest(id),
        ]);
        if (cancelled) return;
        window.location.replace(session.prefix + encodePath(manifest.entry));
      } catch (e) {
        if (cancelled) return;
        // 400 on render-session means the file exists but isn't a
        // static-site. Bounce to the canonical editor URL so users
        // pasting `/f/:id/site` for a non-static-site file still
        // land somewhere sensible.
        if (e instanceof ApiError && e.status === 400) {
          navigate(`/f/${id}`, { replace: true });
          return;
        }
        setError(errorMessage(e, "could not open preview"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  if (error) return <EditorErrorState message={error} />;
  return <EditorLoadingState label="Opening preview…" />;
}

// ─── Visitor (share) ──────────────────────────────────────────────

/** Redirect a share-token visitor to the signed render URL for a
 *  static-site bundle.
 *
 *  - When `fileId` is null, this is a top-level file share; we mint
 *    via `shares.renderSession(token)`.
 *  - When `fileId` is provided, this is a folder-share child; we
 *    mint via `shares.renderSessionForFile(token, fileId)`. The URL
 *    shape on the worker side differs (`/shared/:token/files/:fileId/:sig/…`)
 *    but that's encapsulated in the returned `prefix`.
 *
 *  `blob` is the peeked manifest — passed in rather than re-fetched
 *  because callers always have it on hand.
 */
export function SharedStaticSitePreviewRedirect({
  token,
  fileId,
  blob,
}: {
  token: string;
  fileId: string | null;
  blob: unknown;
}) {
  const [error, setError] = useState<string | null>(null);

  // Pull entry out of the peeked manifest. Defensive cast: callers
  // are expected to have already narrowed `meta.kind === "static-site"`,
  // but blob is typed as the FileBlob union upstream.
  const entry =
    blob && typeof blob === "object" && (blob as StaticSiteFileBlob).kind === "static-site"
      ? (blob as StaticSiteFileBlob).entry
      : null;

  useEffect(() => {
    if (!token || !entry) {
      if (!entry) setError("This share is missing a preview entry page.");
      return;
    }
    let cancelled = false;
    const mint = fileId ? shares.renderSessionForFile(token, fileId) : shares.renderSession(token);
    mint
      .then((session) => {
        if (cancelled) return;
        window.location.replace(session.prefix + encodePath(entry));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(errorMessage(e, "could not open preview"));
      });
    return () => {
      cancelled = true;
    };
  }, [token, fileId, entry]);

  if (error) return <EditorErrorState message={error} />;
  return <EditorLoadingState label="Opening preview…" />;
}

// ─── Shared helper ────────────────────────────────────────────────

/** Percent-encode each path segment without touching the slashes. The
 *  signed URL prefix already contains the file id + sig (or the
 *  folder-share variant); the relpath must be safe to splice in.
 *  Mirrors the helper in StaticSiteEditor. */
function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}
