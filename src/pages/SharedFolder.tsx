// Public folder-share landing page. Lists the folder subtree (rooted at
// the shared folder — the user can't see ancestors) and the scenes
// inside it. Clicking a scene navigates to /share/:token/scenes/:sceneId
// which mounts SharedEditor in folder-share mode.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Download01Icon,
  EyeIcon,
  FolderLibraryIcon,
  HashtagIcon,
  Image01Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";

import {
  ApiError,
  FolderMeta,
  FolderSharePayload,
  SceneMeta,
  shares,
} from "@/api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderTree, folderPath } from "@/components/FolderTree";
import { cn } from "@/lib/utils";

interface SharedFolderProps {
  /** Optional preloaded payload; used by SharedTokenLanding. */
  preloaded?: FolderSharePayload;
}

export default function SharedFolder({ preloaded }: SharedFolderProps = {}) {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<FolderSharePayload | null>(preloaded ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    preloaded?.root.id ?? null
  );

  useEffect(() => {
    if (preloaded) {
      setPayload(preloaded);
      setSelectedId(preloaded.root.id);
      return;
    }
    setPayload(null);
    setErr(null);
    shares
      .loadFolder(token)
      .then((p) => {
        setPayload(p);
        setSelectedId(p.root.id);
      })
      .catch((e) =>
        setErr(e instanceof ApiError ? e.message : "could not load shared folder")
      );
  }, [token, preloaded]);

  const writable = payload?.share.permission === "write";
  const allowDownload = payload?.share.allowDownload ?? false;

  const visibleScenes = useMemo(() => {
    if (!payload || !selectedId) return [];
    return payload.scenes.filter((s) => s.folderId === selectedId);
  }, [payload, selectedId]);

  const breadcrumb = useMemo(() => {
    if (!payload || !selectedId) return [];
    return folderPath(payload.folders, selectedId);
  }, [payload, selectedId]);

  if (err) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-4">
        <div className="flex max-w-sm flex-col items-center gap-2 rounded-lg border border-border bg-card p-6 text-center text-card-foreground">
          <div className="text-sm font-medium">Couldn't load this folder</div>
          <p className="text-xs/relaxed text-muted-foreground">{err}</p>
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex min-h-dvh">
        <aside className="w-60 border-r border-border/60 bg-card/30 p-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-3 h-3 w-2/3" />
          <Skeleton className="mt-1 h-3 w-1/2" />
        </aside>
        <main className="flex-1 p-4">
          <Skeleton className="h-4 w-1/3" />
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
                <Skeleton className="aspect-[4/3] w-full rounded-none" />
                <div className="px-3 py-2">
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </li>
            ))}
          </ul>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur">
        <span className="font-heading text-sm font-medium">
          {payload.root.name}
        </span>
        {writable ? (
          <Badge variant="secondary">
            <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
            Shared · can edit
          </Badge>
        ) : (
          <Badge variant="outline">
            <HugeiconsIcon icon={EyeIcon} strokeWidth={2} />
            Shared · view only
          </Badge>
        )}
        {payload.share.label ? (
          <span className="ml-1 truncate text-xs text-muted-foreground">
            {payload.share.label}
          </span>
        ) : null}
      </header>

      <div className="flex flex-1">
        <aside className="flex w-60 flex-col gap-2 border-r border-border/60 bg-card/30 p-2 text-xs/relaxed">
          <div className="px-1.5 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Folders
          </div>
          <FolderTree
            folders={payload.folders}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
            showCounts
          />
        </aside>

        <main className="flex-1 px-4 py-4">
          <Breadcrumb breadcrumb={breadcrumb} onJump={setSelectedId} />
          <SceneGrid
            scenes={visibleScenes}
            token={token}
            writable={!!writable}
            allowDownload={!!allowDownload}
            onOpen={(s) => navigate(`/share/${token}/scenes/${s.id}`)}
          />
        </main>
      </div>
    </div>
  );
}

function Breadcrumb({
  breadcrumb,
  onJump,
}: {
  breadcrumb: FolderMeta[];
  onJump: (id: string) => void;
}) {
  return (
    <nav className="flex items-center gap-1 text-xs/relaxed text-muted-foreground">
      {breadcrumb.map((f, i) => (
        <span key={f.id} className="flex items-center gap-1">
          {i > 0 ? <span aria-hidden>/</span> : null}
          <button
            type="button"
            onClick={() => onJump(f.id)}
            className={cn(
              "rounded px-1 py-0.5 hover:bg-muted/60",
              i === breadcrumb.length - 1 && "text-foreground font-medium"
            )}
          >
            {f.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

function SceneGrid({
  scenes: list,
  token,
  writable,
  allowDownload,
  onOpen,
}: {
  scenes: SceneMeta[];
  token: string;
  writable: boolean;
  allowDownload: boolean;
  onOpen: (s: SceneMeta) => void;
}) {
  if (list.length === 0) {
    return (
      <div className="mx-auto mt-6 flex max-w-md flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 px-6 py-16 text-center">
        <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.5} className="size-7 text-muted-foreground" />
        <div className="text-sm font-medium">No scenes here</div>
        <p className="text-xs/relaxed text-muted-foreground">
          This folder doesn't contain any scenes directly. Pick a subfolder
          from the sidebar.
        </p>
      </div>
    );
  }
  return (
    <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {list.map((s) => (
        <li
          key={s.id}
          className="group/scene relative overflow-hidden rounded-lg bg-card text-card-foreground ring-1 ring-foreground/10 transition-all hover:ring-foreground/20"
        >
          <button
            type="button"
            onClick={() => onOpen(s)}
            aria-label={`Open ${s.name}`}
            className="block aspect-[4/3] w-full overflow-hidden bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {s.hasThumb ? (
              <img
                src={shares.folderSceneThumbUrl(token, s.id) + `?v=${s.version}`}
                alt=""
                loading="lazy"
                className="h-full w-full object-contain transition-transform duration-300 group-hover/scene:scale-[1.02]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/60">
                <HugeiconsIcon icon={Image01Icon} strokeWidth={1.5} className="size-10" />
              </div>
            )}
          </button>
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <Link
                to={`/share/${token}/scenes/${s.id}`}
                className="block truncate text-xs/relaxed font-medium text-foreground hover:underline"
                title={s.name}
              >
                {s.name}
              </Link>
              {s.tags.length > 0 ? (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {s.tags.slice(0, 2).map((t) => (
                    <span
                      key={t}
                      className="inline-flex max-w-[8rem] items-center gap-0.5 rounded-full bg-accent/40 px-1.5 py-0.5 text-[0.625rem] text-accent-foreground"
                    >
                      <HugeiconsIcon icon={HashtagIcon} strokeWidth={2} className="size-2.5 opacity-60" />
                      <span className="truncate">{t}</span>
                    </span>
                  ))}
                  {s.tags.length > 2 ? (
                    <span className="text-[0.625rem] text-muted-foreground">
                      +{s.tags.length - 2}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            {allowDownload ? (
              <a
                href={shares.folderSceneDownloadUrl(token, s.id)}
                download
                aria-label={`Download ${s.name}`}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-3.5" />
              </a>
            ) : null}
            {writable ? (
              <Badge variant="secondary">
                <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                Edit
              </Badge>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
