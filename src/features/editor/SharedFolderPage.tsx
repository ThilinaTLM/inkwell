// SharedFolderPage — public folder share (`/share/:token`).
//
// Light visitor view of a shared folder tree: wordmark bar (Sign in /
// Open Inkwell), then a header with the folder name, a
// "Shared · View only / Can edit" chip and — when the link allows it —
// "Download all" (client-side zip). Items render through the shared
// `<ItemCollection readOnly>` (cards / list) so the page looks like the
// owner's folder pages, without any owner command: no context menu,
// drag-and-drop, quick actions or selection mirrored to the command
// registry. Double-click / tap / Enter opens: files at
// /share/:token/files/:fileId (SharedEditorPage in folder-share mode),
// sub-folders in place via `?folder=<id>` so browser back/forward walk
// the subtree. Read-only for every permission: edit links grant editing
// of the files themselves (inside the editor), not create/delete here.

import {
  Download01Icon,
  EyeIcon,
  Folder01Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useMemo } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { InkwellLogo } from "@/components/InkwellLogo";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import { SkeletonGrid } from "@/components/SkeletonGrid";
import { Surface } from "@/components/Surface";
import { Button } from "@/components/ui/button";
import { useMe } from "@/data/auth";
import { useSharedFolder } from "@/data/shares";
import {
  type CollectionItem,
  fileToCollectionItem,
  folderToCollectionItem,
  ItemCollection,
} from "@/features/collection";
import { folderPath } from "@/features/folders/FolderTree";
import type { FolderMeta, FolderSharePayload } from "@/lib/api/client";
import { shares } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
import { expiresPhrase } from "@/lib/format";
import { downloadShareZip } from "./shared/shareZip";

interface SharedFolderProps {
  /** Optional preloaded payload; used by SharedTokenLanding. */
  preloaded?: FolderSharePayload;
}

export default function SharedFolderPage({ preloaded }: SharedFolderProps = {}) {
  const { token = "" } = useParams<{ token: string }>();
  const folderQuery = useSharedFolder(preloaded ? "" : token);
  const payload = preloaded ?? folderQuery.data ?? null;

  if (folderQuery.isError) {
    return (
      <Surface variant="page" className="grid place-items-center px-4">
        <EmptyState
          title="Couldn't load this folder"
          body={errorMessage(folderQuery.error, "could not load shared folder")}
        />
      </Surface>
    );
  }
  if (!payload) {
    return (
      <Surface variant="page" className="px-6 py-6">
        <div className="space-y-4">
          <div className="h-10 w-2/3 max-w-sm animate-pulse rounded-md bg-muted/60" />
          <SkeletonGrid count={6} />
        </div>
      </Surface>
    );
  }
  return <SharedFolderExplorer token={token} payload={payload} />;
}

function SharedFolderExplorer({ token, payload }: { token: string; payload: FolderSharePayload }) {
  const navigate = useNavigate();
  const me = useMe();
  const [search, setSearch] = useSearchParams();
  const { share, root } = payload;
  const writable = share.permission === "write";
  const allowDownload = share.allowDownload;

  const allFolders = useMemo(() => {
    const m = new Map<string, FolderMeta>(payload.folders.map((f) => [f.id, f]));
    if (!m.has(root.id)) m.set(root.id, root);
    return [...m.values()];
  }, [payload.folders, root]);

  // Current folder (inside the subtree; anything else falls back to root).
  const folderParam = search.get("folder");
  const folderId =
    folderParam && allFolders.some((f) => f.id === folderParam) ? folderParam : root.id;
  const current = allFolders.find((f) => f.id === folderId) ?? root;
  const path = useMemo(() => {
    const p = folderPath(allFolders, folderId);
    const i = p.findIndex((f) => f.id === root.id);
    return i >= 0 ? p.slice(i) : [root];
  }, [allFolders, folderId, root]);

  const goFolder = useCallback(
    (id: string) => {
      const next = new URLSearchParams(search);
      if (id === root.id) next.delete("folder");
      else next.set("folder", id);
      setSearch(next);
    },
    [search, setSearch, root.id],
  );

  const items = useMemo<CollectionItem[]>(() => {
    const folders = allFolders
      .filter((f) => f.parentId === folderId && f.id !== root.id)
      .map((f) => ({
        ...folderToCollectionItem(f),
        thumbUrl: null,
        starred: false,
        shareCount: 0,
      }));
    const files = payload.files
      .filter((f) => f.folderId === folderId)
      .map((f) => ({
        ...fileToCollectionItem(f),
        starred: false,
        shareCount: 0,
        tags: [],
        thumbUrl: f.hasThumb
          ? `${shares.folderFileThumbUrl(token, f.id)}?v=${f.thumbUpdatedAt}`
          : null,
        visitor: { rawUrl: shares.folderFileRawUrl(token, f.id) },
      }));
    return [...folders, ...files];
  }, [allFolders, payload.files, folderId, root.id, token]);

  const open = useCallback(
    (item: CollectionItem) => {
      if (item.type === "folder") goFolder(item.id);
      else navigate(`/share/${token}/files/${item.id}`);
    },
    [goFolder, navigate, token],
  );

  const downloadAll = useCallback(async () => {
    const id = toast.loading("Preparing zip…");
    try {
      await downloadShareZip({
        token,
        folders: allFolders,
        files: payload.files,
        pickFolderIds: [current.id],
        pickFileIds: [],
        zipName: `${current.name}.zip`,
        onProgress: (d, t) => toast.loading(`Zipping ${d}/${t} files…`, { id }),
      });
      toast.success("Download ready", { id });
    } catch (e) {
      toast.error(errorMessage(e, "could not build zip"), { id });
    }
  }, [token, allFolders, payload.files, current.id, current.name]);

  const sharerName = share.sharedBy
    ? `${share.sharedBy.firstName} ${share.sharedBy.lastName}`.trim()
    : "";
  const count = items.length;
  const expires = expiresPhrase(share.expiresAt ?? null);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-4">
        <Link to="/" className="flex items-center text-foreground" aria-label="Inkwell">
          <InkwellLogo />
        </Link>
        <span className="min-w-0 flex-1" />
        {me.data ? (
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/" />}>
            Open Inkwell
          </Button>
        ) : me.data === null ? (
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/login" />}>
            Sign in
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[1120px] px-4 pt-6 pb-12 sm:px-8 md:pt-10">
          {path.length > 1 ? (
            <nav
              aria-label="Folder path"
              className="mb-3 flex flex-wrap items-center gap-1 text-sm"
            >
              {path.map((f, i) => {
                const last = i === path.length - 1;
                return (
                  <span key={f.id} className="flex items-center gap-1">
                    {i > 0 ? <span className="text-muted-foreground/60">/</span> : null}
                    {last ? (
                      <span aria-current="page" className="text-muted-foreground">
                        {f.name}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => goFolder(f.id)}
                        className="rounded-md px-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        {f.name}
                      </button>
                    )}
                  </span>
                );
              })}
            </nav>
          ) : null}

          <div className="mb-6 flex flex-wrap items-start gap-4">
            {current.id === root.id ? (
              <ProjectIcon folder={root} size="xl" />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                <HugeiconsIcon icon={Folder01Icon} strokeWidth={1.8} className="size-6" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-3xl leading-tight font-medium tracking-tight">
                {current.name}
              </h1>
              <div
                data-testid="share-banner"
                className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                  <HugeiconsIcon
                    icon={writable ? PencilEdit02Icon : EyeIcon}
                    strokeWidth={1.8}
                    className="size-3.5"
                  />
                  Shared · {writable ? "Can edit" : "View only"}
                </span>
                {sharerName ? <span>by {sharerName}</span> : null}
                {share.label ? <span>· “{share.label}”</span> : null}
                <span>
                  · {count} {count === 1 ? "item" : "items"}
                </span>
                {expires ? <span>· link {expires}</span> : null}
                {writable ? <span>· open a file to edit it</span> : null}
              </div>
            </div>
            {allowDownload ? (
              <Button
                variant="outline"
                className="h-9 rounded-[10px] px-3 text-[13px]"
                onClick={() => void downloadAll()}
                title="Download everything in this folder as a zip"
              >
                <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
                <span className="max-sm:sr-only">Download all</span>
              </Button>
            ) : null}
          </div>

          <ItemCollection
            items={items}
            readOnly
            onOpen={open}
            scope={`share:${token}:${folderId}`}
            ariaLabel={current.name}
            empty={
              <p className="text-center text-sm text-muted-foreground">
                “{current.name}” is empty.
              </p>
            }
          />
        </div>
      </div>
    </div>
  );
}
