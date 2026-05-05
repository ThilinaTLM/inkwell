// SharedFolder — public folder-share landing. Same drill-down model as the
// owner Dashboard, but without the user menu, without file/folder
// mutations, and with a single banner row that says "Shared · view only"
// or "Shared · can edit".
//
// The user can still navigate the folder subtree (rooted at the shared
// folder; ancestors are not visible) via the breadcrumb + per-folder
// tab strip. Clicking a file navigates to /share/:token/files/:fileId
// which mounts SharedEditor in folder-share mode.

import {
  ArrowRight01Icon,
  Download01Icon,
  EyeIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PaperSurface } from "@/components/PaperSurface";
import { SkeletonGrid } from "@/components/SkeletonGrid";
import { EmptyDeskNote, FileCard, FolderCard } from "@/components/sketch";
import { useSharedFolder } from "@/data/shares";
import { folderPath } from "@/features/folders/FolderTree";
import type { FileMeta, FolderMeta, FolderSharePayload } from "@/lib/api/client";
import { shares } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
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
  // When the payload arrives (or changes), seed the selected folder.
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
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [payload, selectedId]);

  const breadcrumb = useMemo(() => {
    if (!payload || !selectedId) return [];
    return folderPath(payload.folders, selectedId);
  }, [payload, selectedId]);

  if (folderQuery.isError) {
    return (
      <PaperSurface variant="page" className="grid place-items-center px-4">
        <EmptyDeskNote
          seed="shared-folder-error"
          title="Couldn't load this folder"
          body={errorMessage(folderQuery.error, "could not load shared folder")}
        />
      </PaperSurface>
    );
  }

  if (!payload) {
    return (
      <PaperSurface variant="page" className="px-6 py-6">
        <div className="space-y-4">
          <div className="h-10 w-2/3 max-w-sm animate-pulse rounded-md bg-muted/60" />
          <SkeletonGrid count={6} />
        </div>
      </PaperSurface>
    );
  }

  return (
    <PaperSurface variant="page">
      {/* Banner */}
      <header className="flex flex-wrap items-center gap-3 px-6 pt-6 pb-2">
        <div className="font-heading text-2xl text-foreground">{payload.root.name}</div>
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs ring-1",
            writable
              ? "bg-folder-soft text-foreground ring-folder/40"
              : "bg-card text-muted-foreground ring-border",
          )}
        >
          <HugeiconsIcon
            icon={writable ? PencilEdit02Icon : EyeIcon}
            strokeWidth={1.8}
            className="size-3.5"
          />
          {writable ? "Shared · can edit" : "Shared · view only"}
        </div>
        {payload.share.label ? (
          <span className="text-sm text-muted-foreground/70">"{payload.share.label}"</span>
        ) : null}
      </header>

      <div className="px-6">
        <div className="border-t border-border" />
      </div>

      <main className="px-6 pb-16 pt-3">
        {breadcrumb.length > 0 && <Breadcrumb breadcrumb={breadcrumb} onJump={setSelectedId} />}

        {subfolders.length === 0 && visibleFiles.length === 0 ? (
          <EmptyDeskNote
            seed={`shared-empty-${selectedId}`}
            title={`"${
              payload.folders.find((f) => f.id === selectedId)?.name ?? payload.root.name
            }" is empty`}
            body="No files in this folder. Try another folder above."
          />
        ) : (
          <section
            aria-label="Folder contents"
            className="grid gap-3 px-6 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]"
          >
            {subfolders.map((f) => (
              <FolderCard
                key={`f:${f.id}`}
                id={f.id}
                name={f.name}
                itemCount={f.fileCount + f.subfolderCount}
                previews={f.previews}
                onOpen={() => setSelectedId(f.id)}
              />
            ))}
            {visibleFiles.map((s) => (
              <SharedFileCard
                key={`s:${s.id}`}
                file={s}
                token={token}
                allowDownload={allowDownload}
                onOpen={() => navigate(`/share/${token}/files/${s.id}`)}
              />
            ))}
          </section>
        )}
      </main>
    </PaperSurface>
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
      className="flex items-center gap-1 px-6 py-2 text-sm text-muted-foreground"
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
              i === breadcrumb.length - 1 && "text-foreground",
            )}
          >
            {f.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

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
  return (
    <FileCard
      id={s.id}
      name={s.name}
      kind={s.kind}
      hasThumb={s.hasThumb}
      thumbUrl={`${shares.folderFileThumbUrl(token, s.id)}?v=${s.thumbUpdatedAt}`}
      folderName={null}
      updatedAtLabel={relTime(s.updatedAt)}
      tags={s.tags}
      onOpen={onOpen}
      actions={
        allowDownload ? (
          <a
            href={shares.folderFileDownloadUrl(token, s.id)}
            download
            aria-label={`Download ${s.name}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-3.5" />
          </a>
        ) : null
      }
    />
  );
}
