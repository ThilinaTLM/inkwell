// SharedFolder — public folder-share landing. Same drill-down model as
// the owner dashboard, but without the app shell, without mutations, and
// with a single banner row that says "view only" or "can edit".
//
// The visitor can navigate the folder subtree (rooted at the shared
// folder; ancestors are never visible) via the breadcrumb. Clicking a
// file navigates to /share/:token/files/:fileId which mounts
// SharedEditor in folder-share mode.

import {
  ArrowRight01Icon,
  Download01Icon,
  EyeIcon,
  FolderLibraryIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { EmptyState } from "@/components/EmptyState";
import { FileKindGlyph } from "@/components/file-kinds/file-kind-icons";
import { useSharedFolder } from "@/data/shares";
import { ItemGridSkeleton } from "@/features/explorer/items/ItemGrid";
import { folderPath } from "@/features/folders/FolderTree";
import type { FileMeta, FolderMeta, FolderSharePayload } from "@/lib/api/client";
import { shares } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
import { fileKindInfo } from "@/lib/file-kinds";
import { relTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SharedFolderProps {
  /** Optional preloaded payload; used by SharedTokenLanding. */
  preloaded?: FolderSharePayload;
}

export default function SharedFolderPage({ preloaded }: SharedFolderProps = {}) {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();

  // Skip the network when the parent (SharedTokenLanding) already peeked.
  const folderQuery = useSharedFolder(preloaded ? "" : token);
  const payload = preloaded ?? folderQuery.data ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(payload?.root.id ?? null);
  useEffect(() => {
    if (payload && !selectedId) setSelectedId(payload.root.id);
  }, [payload, selectedId]);

  const writable = payload?.share.permission === "write";
  const allowDownload = payload?.share.allowDownload ?? false;

  const visibleFiles = useMemo(() => {
    if (!payload || !selectedId) return [];
    return payload.files.filter((s) => s.folderId === selectedId);
  }, [payload, selectedId]);

  const subfolders = useMemo(() => {
    if (!payload || !selectedId) return [];
    return payload.folders
      .filter((f) => f.parentId === selectedId)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [payload, selectedId]);

  const breadcrumb = useMemo(() => {
    if (!payload || !selectedId) return [];
    return folderPath(payload.folders, selectedId);
  }, [payload, selectedId]);

  if (folderQuery.isError) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-4">
        <EmptyState
          icon={FolderLibraryIcon}
          title="Couldn't load this folder"
          description={errorMessage(folderQuery.error, "could not load shared folder")}
        />
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="min-h-dvh bg-background px-6 py-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="h-8 w-2/3 max-w-sm animate-pulse rounded-md bg-muted" />
          <ItemGridSkeleton count={6} />
        </div>
      </div>
    );
  }

  const currentName = payload.folders.find((f) => f.id === selectedId)?.name ?? payload.root.name;

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-6 py-3">
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            {payload.root.name}
          </h1>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ring-1",
              writable
                ? "bg-accent text-accent-foreground ring-ring/25"
                : "bg-muted text-muted-foreground ring-border",
            )}
          >
            <HugeiconsIcon
              icon={writable ? PencilEdit02Icon : EyeIcon}
              strokeWidth={1.8}
              className="size-3"
            />
            {writable ? "Shared · can edit" : "Shared · view only"}
          </span>
          {payload.share.label ? (
            <span className="text-xs text-muted-foreground">“{payload.share.label}”</span>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16 pt-4">
        {breadcrumb.length > 0 && <Breadcrumb breadcrumb={breadcrumb} onJump={setSelectedId} />}

        {subfolders.length === 0 && visibleFiles.length === 0 ? (
          <EmptyState
            icon={FolderLibraryIcon}
            title={`“${currentName}” is empty`}
            description="No files in this folder."
          />
        ) : (
          <section aria-label="Folder contents" className="flex flex-col gap-4">
            {subfolders.length > 0 ? (
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
                {subfolders.map((f) => (
                  <button
                    key={`f:${f.id}`}
                    type="button"
                    onClick={() => setSelectedId(f.id)}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-ring/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <HugeiconsIcon
                      icon={FolderLibraryIcon}
                      strokeWidth={1.6}
                      className="size-5 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {f.name}
                      </span>
                      <span className="block text-[0.6875rem] text-muted-foreground">
                        {f.fileCount + f.subfolderCount} items
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {visibleFiles.length > 0 ? (
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]">
                {visibleFiles.map((s) => (
                  <SharedFileCard
                    key={`s:${s.id}`}
                    file={s}
                    token={token}
                    allowDownload={allowDownload}
                    onOpen={() => navigate(`/share/${token}/files/${s.id}`)}
                  />
                ))}
              </div>
            ) : null}
          </section>
        )}
      </main>
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
    <nav
      aria-label="Folder path"
      className="flex items-center gap-1 pb-3 text-xs text-muted-foreground"
    >
      {breadcrumb.map((f, i) => (
        <span key={f.id} className="flex items-center gap-1">
          {i > 0 ? (
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={1.5}
              className="size-3 opacity-50"
            />
          ) : null}
          <button
            type="button"
            onClick={() => onJump(f.id)}
            className={cn(
              "rounded px-1 py-0.5 transition-colors hover:text-foreground",
              i === breadcrumb.length - 1 && "font-medium text-foreground",
            )}
          >
            {f.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

/** Read-only twin of `<FileGridCard>`: same geometry, no context menu,
 *  share-scoped thumbnail and download URLs. */
function SharedFileCard({
  file: s,
  token,
  allowDownload,
  onOpen,
}: {
  file: FileMeta;
  token: string;
  allowDownload: boolean;
  onOpen: () => void;
}) {
  const info = fileKindInfo(s.kind);
  return (
    // biome-ignore lint/a11y/useSemanticElements: a button element cannot contain the nested download link this tile needs
    <div
      role="button"
      aria-label={s.name}
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      title={s.name}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-ring/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden border-b border-border bg-muted/40">
        {s.hasThumb ? (
          <img
            src={`${shares.folderFileThumbUrl(token, s.id)}?v=${s.thumbUpdatedAt}`}
            alt=""
            loading="lazy"
            className="ink-thumb-img size-full object-cover"
          />
        ) : (
          <div className={cn("grid size-full place-items-center", info.tintClass)}>
            <FileKindGlyph kind={s.kind} className="size-7 opacity-90" />
          </div>
        )}
        {allowDownload ? (
          <a
            href={shares.folderFileDownloadUrl(token, s.id)}
            download
            aria-label={`Download ${s.name}`}
            onClick={(e) => e.stopPropagation()}
            className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-md bg-card/90 text-muted-foreground opacity-0 ring-1 ring-border backdrop-blur transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          >
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-3" />
          </a>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <FileKindGlyph kind={s.kind} className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {s.name}
          </span>
        </span>
        <span className="truncate text-[0.6875rem] text-muted-foreground">
          {relTime(s.updatedAt)}
        </span>
      </div>
    </div>
  );
}
