// Dispatcher for /share/:token.
//
// The same URL serves both scene shares and folder shares; we peek the
// token once and pick the right view. The peek result is fed to the
// child as `preloaded` so neither child re-fetches.

import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { PaperSurface } from "@/components/PaperSurface";
import { EmptyDeskNote } from "@/components/sketch";
import { shares } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { errorMessage } from "@/lib/errors";

import SharedEditorPage from "./SharedEditorPage";
import SharedFolderPage from "./SharedFolderPage";

export default function SharedTokenLandingPage() {
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
  return <SharedEditorPage preloaded={data.scene} />;
}
