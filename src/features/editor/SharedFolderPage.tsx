// SharedFolder — public folder-share landing. Same drill-down model as the
// owner Dashboard, but without the user menu, without scene/folder
// mutations, and with a single banner row that says "Shared · view only"
// or "Shared · can edit".
//
// The user can still navigate the folder subtree (rooted at the shared
// folder; ancestors are not visible) via the breadcrumb + per-folder
// tab strip. Clicking a scene navigates to /share/:token/scenes/:sceneId
// which mounts SharedEditor in folder-share mode.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Download01Icon,
  EyeIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";

import {
  ApiError,
  FolderMeta,
  FolderSharePayload,
  SceneMeta,
  shares,
} from "@/api";
import { PaperSurface } from "@/components/PaperSurface";
import {
  EmptyDeskNote,
  FolderCard,
  SceneCard,
} from "@/components/sketch";
import { folderPath } from "@/components/FolderTree";
import { cn } from "@/lib/utils";

interface SharedFolderProps {
  /** Optional preloaded payload; used by SharedTokenLanding. */
  preloaded?: FolderSharePayload;
}

export default function SharedFolder({ preloaded }: SharedFolderProps = {}) {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<FolderSharePayload | null>(
    preloaded ?? null
  );
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
        setErr(
          e instanceof ApiError ? e.message : "could not load shared folder"
        )
      );
  }, [token, preloaded]);

  const writable = payload?.share.permission === "write";
  const allowDownload = payload?.share.allowDownload ?? false;

  const visibleScenes = useMemo(() => {
    if (!payload || !selectedId) return [];
    return payload.scenes.filter((s) => s.folderId === selectedId);
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

  if (err) {
    return (
      <PaperSurface variant="page" className="grid place-items-center px-4">
        <EmptyDeskNote
          seed="shared-folder-error"
          title="Couldn't load this folder"
          body={err}
        />
      </PaperSurface>
    );
  }

  if (!payload) {
    return (
      <PaperSurface variant="page" className="px-6 py-6">
        <div className="space-y-4">
          <div className="h-10 w-2/3 max-w-sm animate-pulse rounded-md bg-paper-edge/60" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[4/3] w-full animate-pulse rounded-md bg-paper-edge/50"
              />
            ))}
          </div>
        </div>
      </PaperSurface>
    );
  }

  return (
    <PaperSurface variant="page">
      {/* Banner */}
      <header className="flex flex-wrap items-center gap-3 px-6 pt-6 pb-2">
        <div className="font-heading text-2xl text-ink">
          {payload.root.name}
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs ring-1",
            writable
              ? "bg-manila-soft text-ink ring-manila/40"
              : "bg-paper-elev text-ink-soft ring-ink-soft/20"
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
          <span className="font-hand text-base text-ink-muted">
            "{payload.share.label}"
          </span>
        ) : null}
      </header>

      <div className="px-6">
        <div className="border-t border-ink-soft/15" />
      </div>

      <main className="px-6 pb-16 pt-3">
        {breadcrumb.length > 0 && (
          <Breadcrumb breadcrumb={breadcrumb} onJump={setSelectedId} />
        )}

        {subfolders.length === 0 && visibleScenes.length === 0 ? (
          <EmptyDeskNote
            seed={`shared-empty-${selectedId}`}
            title={`"${
              payload.folders.find((f) => f.id === selectedId)?.name ??
              payload.root.name
            }" is empty`}
            body="No scenes in this folder. Try another folder above."
          />
        ) : (
          <div className="space-y-6">
            {subfolders.length > 0 && (
              <section aria-label="Subfolders">
                <h3 className="px-6 pb-2 font-heading text-lg text-ink-soft">
                  Folders
                </h3>
                <div className="grid grid-cols-2 gap-4 px-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {subfolders.map((f) => (
                    <FolderCard
                      key={f.id}
                      id={f.id}
                      name={f.name}
                      sceneCount={f.sceneCount}
                      onSelect={() => setSelectedId(f.id)}
                      onOpen={() => setSelectedId(f.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {visibleScenes.length > 0 && (
              <section aria-label="Scenes">
                <h3 className="px-6 pb-2 font-heading text-lg text-ink-soft">
                  Scenes
                </h3>
                <div className="grid grid-cols-1 gap-5 px-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {visibleScenes.map((s) => (
                    <SharedSceneCard
                      key={s.id}
                      scene={s}
                      token={token}
                      allowDownload={allowDownload}
                      onOpen={() =>
                        navigate(`/share/${token}/scenes/${s.id}`)
                      }
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
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
      className="flex items-center gap-1 px-6 py-2 font-hand text-base text-ink-soft"
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
              "rounded px-1 py-0.5 transition-colors hover:text-ink",
              i === breadcrumb.length - 1 && "text-ink"
            )}
          >
            {f.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

function SharedSceneCard({
  scene: s,
  token,
  allowDownload,
  onOpen,
}: {
  scene: SceneMeta;
  token: string;
  allowDownload: boolean;
  onOpen: () => void;
}) {
  return (
    <SceneCard
      id={s.id}
      name={s.name}
      hasThumb={s.hasThumb}
      thumbUrl={`${shares.folderSceneThumbUrl(token, s.id)}?v=${s.version}`}
      folderName={null}
      updatedAtLabel={relTime(s.updatedAt)}
      tags={s.tags}
      onSelect={onOpen}
      onOpen={onOpen}
      actions={
        allowDownload ? (
          <a
            href={shares.folderSceneDownloadUrl(token, s.id)}
            download
            aria-label={`Download ${s.name}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex size-7 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-manila-soft hover:text-ink"
          >
            <HugeiconsIcon
              icon={Download01Icon}
              strokeWidth={2}
              className="size-3.5"
            />
          </a>
        ) : null
      }
    />
  );
}

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}
