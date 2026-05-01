// Dispatcher for /share/:token. The same URL serves both scene shares
// (renders SharedEditor with the blob already in hand) and folder
// shares (renders SharedFolder with the subtree listing). We peek the
// token once via `shares.peek()` and pick the right view.
//
// Mounting SharedEditor with `presetScene` short-circuits its own fetch
// so we don't double-load the blob.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { ApiError, FolderSharePayload, LoadedScene, shares } from "@/api";
import SharedFolder from "./SharedFolder";
import SharedEditor from "./SharedEditor";

type Resolved =
  | { kind: "scene"; scene: LoadedScene }
  | { kind: "folder"; payload: FolderSharePayload };

export default function SharedTokenLanding() {
  const { token = "" } = useParams<{ token: string }>();
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "ready"; data: Resolved }
    | { phase: "error"; message: string }
  >({ phase: "loading" });

  useEffect(() => {
    setState({ phase: "loading" });
    shares
      .peek(token)
      .then((r) => {
        if (r.type === "scene") {
          setState({ phase: "ready", data: { kind: "scene", scene: r.scene } });
        } else {
          setState({ phase: "ready", data: { kind: "folder", payload: r.payload } });
        }
      })
      .catch((e) =>
        setState({
          phase: "error",
          message: e instanceof ApiError ? e.message : "could not open this link",
        })
      );
  }, [token]);

  if (state.phase === "loading") return null; // SharedEditor/SharedFolder render their own skeletons after re-mount
  if (state.phase === "error") {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-4">
        <div className="flex max-w-sm flex-col items-center gap-2 rounded-lg border border-border bg-card p-6 text-center text-card-foreground">
          <div className="text-sm font-medium">Couldn't open this link</div>
          <p className="text-xs/relaxed text-muted-foreground">{state.message}</p>
        </div>
      </div>
    );
  }
  if (state.data.kind === "folder") {
    return <SharedFolder preloaded={state.data.payload} />;
  }
  return <SharedEditor preloaded={state.data.scene} />;
}
