// Dispatcher for /share/:token.
//
// The same URL serves both file shares and folder shares; we peek the
// token once and pick the right view. The peek result is fed to the
// child as `preloaded` so neither child re-fetches.
//
// Special case for static-site file shares: rather than rendering the
// `StaticSiteEditor` management surface (which would show share
// visitors a read-only file list of the bundle), we mint a share
// render-session and redirect to the signed `/shared/:token/:sig/...`
// URL. For static-site content the *preview* is the thing visitors
// are meant to see; the file-list surface is an owner concept.
//
// We deliberately do NOT do the same redirect for folder shares (a
// folder share never resolves to a single previewable artifact) or
// for non-static-site file shares (those need the in-app editor for
// view/edit semantics). The analogous redirect for folder-share
// CHILDREN that happen to be static-site files lives in
// `SharedEditorPage` — it can't run here because the dispatcher
// doesn't see the child fileId.

import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { PaperSurface } from "@/components/PaperSurface";
import { EmptyDeskNote } from "@/components/sketch/EmptyDeskNote";
import { shares } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { errorMessage } from "@/lib/errors";

import { SharedEditorPage } from "./SharedEditorPage";
import SharedFolderPage from "./SharedFolderPage";
import { SharedStaticSitePreviewRedirect } from "./StaticSitePreviewRedirect";

export function SharedTokenLandingPage() {
  const { token = "" } = useParams<{ token: string }>();

  const peek = useQuery({
    queryKey: keys.publicShare.token(token),
    queryFn: () => shares.peek(token),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // While loading, render nothing — the children show their own
  // skeletons after re-mount, and a top-level skeleton would just flash.
  if (peek.isPending) return null;

  if (peek.isError) {
    return (
      <PaperSurface variant="page" className="grid place-items-center px-4">
        <EmptyDeskNote
          seed="shared-link-error"
          title="Couldn't open this link"
          body={errorMessage(peek.error, "could not open this link")}
        />
      </PaperSurface>
    );
  }

  const data = peek.data;
  if (!data) return null;
  if (data.type === "folder") {
    return <SharedFolderPage preloaded={data.payload} />;
  }
  // Static-site file shares → redirect to the signed preview URL
  // rather than rendering the read-only management surface.
  if (data.file.meta.kind === "static-site") {
    return <SharedStaticSitePreviewRedirect token={token} fileId={null} blob={data.file.blob} />;
  }
  return <SharedEditorPage preloaded={data.file} />;
}
