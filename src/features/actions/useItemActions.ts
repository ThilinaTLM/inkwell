// The single implementation of item operations over `ItemRef[]`.
//
// PUBLIC CONTRACT
//   useItemActions(): ItemActions        – hook; binds QueryClient + navigate, returns a
//                                          stable object (same as `itemActions`)
//   itemActions: ItemActions             – module singleton for non-React callers
//                                          (commands); requires a bound runtime
//                                          (AppShell / any useItemActions() caller binds it)
//   bindItemActionsRuntime({ qc, navigate })
//   defaultNameForKind(kind)
//
//   interface ItemActions {
//     open(ref, opts?: { newTab?: boolean }): void
//     reveal(ref): void                              – go to parent folder with ?select=type:id
//     share(ref): void                               – ShareDialog
//     copyLink(ref): Promise<void>                   – newest active view link, else creates 7-day link
//     setStar(refs, starred: boolean): Promise<void> – optimistic, undoable
//     toggleStar(refs): Promise<void>                – unstar if all starred, else star
//     editTags(refs): void                           – tags dialog
//     move(refs, targetFolderId: string | null): Promise<void>   – optimistic, undoable toast
//     moveDialog(refs): void
//     duplicate(refs, targetFolderId?): Promise<void>            – undo = trash + purge copies
//     cut(refs) / copy(refs): void
//     paste(targetFolderId: string | null): Promise<void>        – cut → move, copy → duplicate
//     download(refs): Promise<void>                  – single file → /download; else zip
//     rename(ref, name): Promise<void>               – undoable
//     renameDialog(ref): void
//     trash(refs): Promise<void>                     – undo = restore; confirm if pref on
//     restore(refs): Promise<void>                   – undo = trash
//     purge(refs): Promise<void>                     – confirm, permanent
//     emptyTrash(): Promise<void>                    – confirm, permanent
//     newFile(folderId, kind?, opts?: { name?: string; open?: boolean }): Promise<FileMeta | null>
//         – no kind → opens the quick picker dialog; with kind → creates (and opens unless open:false)
//     newFolder(parentId): void                      – new-folder dialog
//     createFolder(parentId, name): Promise<FolderMeta | null>
//     setTags(refs, next: (prev: string[], ref) => string[]): Promise<void>  – undoable
//   }

import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { invalidations } from "@/data/invalidations";
import { confirmDialog, openDialog } from "@/features/dialogs/dialogStore";
import {
  ApiError,
  type FileKind,
  type FileMeta,
  type FolderMeta,
  files,
  folders,
  type ItemRef,
  items as itemsApi,
  type Share,
  trash as trashApi,
} from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { copyToClipboard } from "@/lib/clipboard";
import { getCommandContext } from "@/lib/commands/registry";
import { errorMessage } from "@/lib/errors";
import { getExplorerPref } from "@/lib/explorerPrefs";
import { clearSelection } from "@/lib/selection";
import { toastWithUndo } from "@/lib/undo";
import { shareUrl } from "@/lib/url";
import { clearClipboard, getClipboard, setClipboard } from "./clipboard";
import { downloadAsZip, triggerUrlDownload } from "./download";
import {
  applyMoveToCache,
  descendantFolderIds,
  ensureItems,
  findFolderMeta,
  getFoldersCached,
  patchFileLists,
  patchFolderList,
  removeFromLists,
  resolveItems,
} from "./itemCache";
import { pushRecentDestination } from "./recentDestinations";

type Navigate = (to: string, opts?: { replace?: boolean }) => void;

interface Runtime {
  qc: QueryClient | null;
  navigate: Navigate | null;
}

const runtime: Runtime = { qc: null, navigate: null };

export function bindItemActionsRuntime(r: { qc: QueryClient; navigate: Navigate }): void {
  runtime.qc = r.qc;
  runtime.navigate = r.navigate;
}

/** The bound QueryClient, or null before AppShell / useItemActions ran. */
export function getActionsQueryClient(): QueryClient | null {
  return runtime.qc;
}

function qc(): QueryClient {
  if (!runtime.qc) throw new Error("item actions runtime not bound");
  return runtime.qc;
}

function nav(to: string, opts?: { replace?: boolean }) {
  if (runtime.navigate) runtime.navigate(to, opts);
  else location.assign(to);
}

export function defaultNameForKind(kind: FileKind): string {
  switch (kind) {
    case "drawio":
      return "Untitled diagram";
    case "notes":
      return "Untitled note";
    case "static-site":
      return "Untitled site";
    default:
      return "Untitled drawing";
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function describe(refs: ItemRef[]): string {
  if (refs.length === 1) {
    const [info] = resolveItems(qc(), refs);
    return `"${info.name}"`;
  }
  return plural(refs.length, "item");
}

function folderName(id: string | null): string {
  if (id === null) return "Home";
  return findFolderMeta(qc(), id)?.name ?? "folder";
}

function urlFor(ref: ItemRef): string {
  return ref.type === "folder" ? `/folders/${ref.id}` : `/f/${ref.id}`;
}

function fail(e: unknown, fallback: string) {
  if (e instanceof ApiError && e.status === 409) {
    toast.error("Can't move a folder into itself or one of its subfolders.");
    return;
  }
  if (e instanceof ApiError && e.status === 413) {
    toast.error("Too many items at once — select at most 500.");
    return;
  }
  toast.error(errorMessage(e, fallback));
}

/** Drop items whose ancestor folder is also in the list. */
function topLevel(refs: ItemRef[]): ItemRef[] {
  const all = getFoldersCached(qc());
  const selectedFolders = refs.filter((r) => r.type === "folder").map((r) => r.id);
  if (!selectedFolders.length) return dedupe(refs);
  const byId = new Map(all.map((f) => [f.id, f]));
  const sel = new Set(selectedFolders);
  const hasSelectedAncestor = (parentId: string | null) => {
    let cur = parentId;
    let guard = 0;
    while (cur && guard++ < 64) {
      if (sel.has(cur)) return true;
      cur = byId.get(cur)?.parentId ?? null;
    }
    return false;
  };
  const infos = resolveItems(qc(), dedupe(refs));
  return infos.filter((i) => !hasSelectedAncestor(i.parentId)).map((i) => i.ref);
}

function dedupe(refs: ItemRef[]): ItemRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = `${r.type}:${r.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ─── Operations ────────────────────────────────────────────────────────

function open(ref: ItemRef, opts: { newTab?: boolean } = {}) {
  const newTab = opts.newTab ?? (ref.type === "file" && getExplorerPref("openFilesIn") === "new");
  if (newTab) {
    window.open(urlFor(ref), "_blank", "noopener");
    return;
  }
  nav(urlFor(ref));
}

function reveal(ref: ItemRef) {
  const [info] = resolveItems(qc(), [ref]);
  const base = info.parentId ? `/folders/${info.parentId}` : "/";
  nav(`${base}?select=${ref.type}:${ref.id}`);
}

function share(ref: ItemRef) {
  openDialog("share", { item: ref });
}

async function copyLink(ref: ItemRef) {
  try {
    const list: Share[] =
      ref.type === "folder" ? await folders.listShares(ref.id) : await files.listShares(ref.id);
    const now = Date.now();
    const existing = list
      .filter((s) => s.permission === "read" && (s.expiresAt === null || s.expiresAt > now))
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    let token = existing?.token;
    let created = false;
    if (!token) {
      const body = { permission: "read" as const, expiresAt: now + 7 * 24 * 3600 * 1000 };
      const s =
        ref.type === "folder"
          ? await folders.createShare(ref.id, body)
          : await files.createShare(ref.id, body);
      token = s.token;
      created = true;
      invalidations.shareMutated(qc(), ref.type, ref.id);
    }
    const ok = await copyToClipboard(shareUrl(token));
    if (ok) {
      toast.success(created ? "View link created and copied (expires in 7 days)" : "Link copied");
    } else {
      toast.error("Couldn't access the clipboard");
    }
  } catch (e) {
    fail(e, "could not copy link");
  }
}

async function setStar(refs: ItemRef[], starred: boolean) {
  const client = qc();
  const infos = resolveItems(client, dedupe(refs));
  const changed = infos.filter((i) => !!i.starredAt !== starred).map((i) => i.ref);
  const target = changed.length ? changed : infos.map((i) => i.ref);
  if (!target.length) return;
  const apply = (value: boolean) => {
    const at = value ? Date.now() : null;
    const fileIds = new Set(target.filter((r) => r.type === "file").map((r) => r.id));
    const folderIds = new Set(target.filter((r) => r.type === "folder").map((r) => r.id));
    patchFileLists(client, fileIds, (f) => ({ ...f, starredAt: at }));
    patchFolderList(client, folderIds, (f) => ({ ...f, starredAt: at }));
  };
  apply(starred);
  try {
    await itemsApi.star(target, starred);
    invalidations.itemsMutated(client);
    toastWithUndo(`${starred ? "Starred" : "Unstarred"} ${describe(target)}`, async () => {
      await itemsApi.star(target, !starred);
      invalidations.itemsMutated(client);
    });
  } catch (e) {
    apply(!starred);
    invalidations.itemsMutated(client);
    fail(e, "could not update star");
  }
}

async function toggleStar(refs: ItemRef[]) {
  const infos = resolveItems(qc(), refs);
  const allStarred = infos.length > 0 && infos.every((i) => !!i.starredAt);
  await setStar(refs, !allStarred);
}

function editTags(refs: ItemRef[]) {
  if (!refs.length) return;
  openDialog("tags", { items: dedupe(refs) });
}

async function setTags(refs: ItemRef[], next: (prev: string[], ref: ItemRef) => string[]) {
  const client = qc();
  const infos = await ensureItems(client, dedupe(refs));
  const before = infos.map((i) => ({ ref: i.ref, tags: i.tags }));
  const writeTags = async (list: Array<{ ref: ItemRef; tags: string[] }>) => {
    await Promise.all(
      list.map(({ ref, tags }) =>
        ref.type === "file" ? files.setTags(ref.id, tags) : folders.update(ref.id, { tags }),
      ),
    );
    invalidations.itemsMutated(client);
  };
  const after = before.map((b) => ({ ref: b.ref, tags: next(b.tags, b.ref) }));
  const changed = after.filter((a, i) => a.tags.join("\u0000") !== before[i].tags.join("\u0000"));
  if (!changed.length) return;
  await writeTags(changed);
  const prev = before.filter((b) => changed.some((c) => c.ref.id === b.ref.id));
  toastWithUndo(`Updated tags on ${describe(changed.map((c) => c.ref))}`, () => writeTags(prev));
}

async function move(refs: ItemRef[], targetFolderId: string | null) {
  const client = qc();
  await ensureItems(client, refs);
  const top = topLevel(refs);
  const infos = resolveItems(client, top);
  // Skip no-ops and self/descendant targets for folders.
  const invalid = targetFolderId
    ? descendantFolderIds(
        getFoldersCached(client),
        top.filter((r) => r.type === "folder").map((r) => r.id),
      )
    : new Set<string>();
  if (targetFolderId && invalid.has(targetFolderId)) {
    toast.error("Can't move a folder into itself or one of its subfolders.");
    return;
  }
  const toMove = infos.filter((i) => i.parentId !== targetFolderId).map((i) => i.ref);
  if (!toMove.length) {
    toast(`Already in ${folderName(targetFolderId)}`);
    return;
  }
  applyMoveToCache(client, toMove, targetFolderId);
  try {
    const { previous } = await itemsApi.move(toMove, targetFolderId);
    invalidations.itemsMutated(client);
    pushRecentDestination(targetFolderId);
    clearSelection();
    toastWithUndo(`Moved ${describe(toMove)} to ${folderName(targetFolderId)}`, async () => {
      // Group by original parent and move back.
      const groups = new Map<string, ItemRef[]>();
      for (const p of previous) {
        const k = p.parentId ?? "\u0000root";
        const arr = groups.get(k) ?? [];
        arr.push({ type: p.type, id: p.id });
        groups.set(k, arr);
      }
      for (const [k, list] of groups) {
        await itemsApi.move(list, k === "\u0000root" ? null : k);
      }
      invalidations.itemsMutated(client);
    });
  } catch (e) {
    invalidations.itemsMutated(client);
    fail(e, "could not move");
  }
}

function moveDialog(refs: ItemRef[]) {
  if (!refs.length) return;
  openDialog("move", { items: dedupe(refs) });
}

async function duplicate(refs: ItemRef[], targetFolderId?: string | null) {
  const client = qc();
  await ensureItems(client, refs);
  const top = topLevel(refs);
  if (!top.length) return;
  try {
    const res = await itemsApi.duplicate(top, targetFolderId);
    invalidations.itemsMutated(client);
    if (targetFolderId !== undefined) pushRecentDestination(targetFolderId);
    // Only the top-level copies are needed for the inverse: trashing a
    // folder copy takes its subtree with it.
    const copiedFolderIds = new Set(res.folders.map((f) => f.id));
    const topCopies: ItemRef[] = [
      ...res.folders
        .filter((f) => !f.parentId || !copiedFolderIds.has(f.parentId))
        .map((f) => ({ type: "folder" as const, id: f.id })),
      ...res.files
        .filter((f) => !f.folderId || !copiedFolderIds.has(f.folderId))
        .map((f) => ({ type: "file" as const, id: f.id })),
    ];
    const where = targetFolderId !== undefined ? ` to ${folderName(targetFolderId)}` : "";
    toastWithUndo(`Duplicated ${describe(top)}${where}`, async () => {
      await itemsApi.trash(topCopies);
      await itemsApi.purge(topCopies);
      invalidations.itemsMutated(client);
    });
  } catch (e) {
    fail(e, "could not duplicate");
  }
}

function cut(refs: ItemRef[]) {
  if (!refs.length) return;
  setClipboard("cut", dedupe(refs));
  toast(`Cut ${plural(refs.length, "item")} — paste with ⌘V / Ctrl+V`);
}

function copy(refs: ItemRef[]) {
  if (!refs.length) return;
  setClipboard("copy", dedupe(refs));
  toast(`Copied ${plural(refs.length, "item")} — paste with ⌘V / Ctrl+V`);
}

async function paste(targetFolderId: string | null) {
  const clip = getClipboard();
  if (!clip.mode || !clip.items.length) {
    toast("Clipboard is empty");
    return;
  }
  if (clip.mode === "cut") {
    clearClipboard();
    await move(clip.items, targetFolderId);
  } else {
    await duplicate(clip.items, targetFolderId);
  }
}

async function download(refs: ItemRef[]) {
  const list = dedupe(refs);
  if (!list.length) return;
  if (list.length === 1 && list[0].type === "file") {
    triggerUrlDownload(files.downloadUrl(list[0].id));
    return;
  }
  const id = toast.loading(`Preparing zip of ${describe(list)}…`);
  try {
    await downloadAsZip(qc(), list, (done, total) =>
      toast.loading(`Zipping ${done}/${total} files…`, { id }),
    );
    toast.success("Download ready", { id });
  } catch (e) {
    toast.error(errorMessage(e, "could not build zip"), { id });
  }
}

async function renameRaw(ref: ItemRef, name: string) {
  if (ref.type === "file") await files.rename(ref.id, name);
  else await folders.update(ref.id, { name });
}

async function rename(ref: ItemRef, name: string) {
  const client = qc();
  const next = name.trim();
  if (!next) return;
  const [info] = await ensureItems(client, [ref]);
  const prev = info.name;
  if (prev === next) return;
  const ids = new Set([ref.id]);
  if (ref.type === "file") patchFileLists(client, ids, (f) => ({ ...f, name: next }));
  else patchFolderList(client, ids, (f) => ({ ...f, name: next }));
  try {
    await renameRaw(ref, next);
    invalidations.itemsMutated(client);
    client.invalidateQueries({ queryKey: keys.files.detail(ref.id) });
    toastWithUndo(`Renamed to "${next}"`, async () => {
      await renameRaw(ref, prev);
      invalidations.itemsMutated(client);
    });
  } catch (e) {
    invalidations.itemsMutated(client);
    fail(e, "could not rename");
    throw e;
  }
}

function renameDialog(ref: ItemRef) {
  openDialog("rename", { item: ref });
}

async function trash(refs: ItemRef[]) {
  const client = qc();
  await ensureItems(client, refs);
  const top = topLevel(refs);
  if (!top.length) return;
  if (getExplorerPref("confirmTrash")) {
    const ok = await confirmDialog({
      title: `Move ${describe(top)} to Trash?`,
      description: "Items stay in Trash for 30 days before they are deleted permanently.",
      confirmLabel: "Move to Trash",
    });
    if (!ok) return;
  }
  // If the user is inside a folder being trashed, step out first.
  const ctx = getCommandContext();
  const trashedFolders = descendantFolderIds(
    getFoldersCached(client),
    top.filter((r) => r.type === "folder").map((r) => r.id),
  );
  if (ctx.currentFolderId && trashedFolders.has(ctx.currentFolderId)) {
    const topFolder = resolveItems(
      client,
      top.filter((r) => r.type === "folder"),
    ).find((i) =>
      descendantFolderIds(getFoldersCached(client), [i.ref.id]).has(ctx.currentFolderId as string),
    );
    nav(topFolder?.parentId ? `/folders/${topFolder.parentId}` : "/");
  }
  removeFromLists(client, top);
  try {
    await itemsApi.trash(top);
    invalidations.itemsMutated(client);
    clearSelection();
    toastWithUndo(`Moved ${describe(top)} to Trash`, async () => {
      await itemsApi.restore(top);
      invalidations.itemsMutated(client);
    });
  } catch (e) {
    invalidations.itemsMutated(client);
    fail(e, "could not move to Trash");
  }
}

async function restore(refs: ItemRef[]) {
  const client = qc();
  const list = dedupe(refs);
  if (!list.length) return;
  try {
    const { restored } = await itemsApi.restore(list);
    invalidations.itemsMutated(client);
    const relocated = restored.filter((r) => r.relocatedToRoot).length;
    toastWithUndo(
      `Restored ${plural(restored.length || list.length, "item")}`,
      async () => {
        await itemsApi.trash(list);
        invalidations.itemsMutated(client);
      },
      {
        description: relocated
          ? relocated === 1
            ? "1 item was restored to Home because its original folder is unavailable."
            : `${relocated} items were restored to Home because their original folders are unavailable.`
          : undefined,
      },
    );
  } catch (e) {
    fail(e, "could not restore");
  }
}

async function purge(refs: ItemRef[]) {
  const client = qc();
  const list = dedupe(refs);
  if (!list.length) return;
  const ok = await confirmDialog({
    title: `Delete ${plural(list.length, "item")} forever?`,
    description: "This can't be undone. Share links to these items stop working.",
    confirmLabel: "Delete forever",
  });
  if (!ok) return;
  try {
    await itemsApi.purge(list);
    invalidations.itemsMutated(client);
    clearSelection();
    toast.success(`Deleted ${plural(list.length, "item")} forever`);
  } catch (e) {
    fail(e, "could not delete");
  }
}

async function emptyTrash() {
  const client = qc();
  const ok = await confirmDialog({
    title: "Empty Trash?",
    description: "Everything in Trash is deleted permanently. This can't be undone.",
    confirmLabel: "Empty Trash",
  });
  if (!ok) return;
  try {
    const { purged } = await trashApi.empty();
    invalidations.itemsMutated(client);
    toast.success(`Deleted ${plural(purged, "item")} forever`);
  } catch (e) {
    fail(e, "could not empty Trash");
  }
}

async function newFile(
  folderId: string | null,
  kind?: FileKind,
  opts: { name?: string; open?: boolean } = {},
): Promise<FileMeta | null> {
  if (!kind) {
    openDialog("newFile", { folderId });
    return null;
  }
  const client = qc();
  try {
    const m = await files.create({
      name: opts.name?.trim() || defaultNameForKind(kind),
      folderId,
      kind,
    });
    invalidations.fileMutated(client);
    if (opts.open === false) toast.success(`Created "${m.name}"`);
    else nav(`/f/${m.id}`);
    return m;
  } catch (e) {
    fail(e, "could not create file");
    return null;
  }
}

function newFolder(parentId: string | null) {
  openDialog("newFolder", { parentId });
}

async function createFolder(parentId: string | null, name: string): Promise<FolderMeta | null> {
  const client = qc();
  try {
    const f = await folders.create({ name: name.trim(), parentId });
    invalidations.folderMutated(client);
    toast.success(`Created folder "${f.name}"`);
    return f;
  } catch (e) {
    fail(e, "could not create folder");
    return null;
  }
}

export const itemActions = {
  open,
  reveal,
  share,
  copyLink,
  setStar,
  toggleStar,
  editTags,
  setTags,
  move,
  moveDialog,
  duplicate,
  cut,
  copy,
  paste,
  download,
  rename,
  renameDialog,
  trash,
  restore,
  purge,
  emptyTrash,
  newFile,
  newFolder,
  createFolder,
};

export type ItemActions = typeof itemActions;

export function useItemActions(): ItemActions {
  const client = useQueryClient();
  const navigate = useNavigate();
  bindItemActionsRuntime({ qc: client, navigate });
  return itemActions;
}
