// Registers the app-wide command set (item operations, navigation, view,
// shell toggles) with the wireframe keyboard-map defaults.
//
// PUBLIC CONTRACT
//   registerAppCommands(opts: { isAdmin: () => boolean }): () => void
//     – called once by AppShell. Pages may override any id by registering
//       a command with the same id (newest registration wins), e.g. the
//       explorer overrides `item.rename` (inline rename) and `select.all`.
//   targetsOf(ctx): ItemRef[]   – selection, or [focused] when nothing is selected
//   ITEM_MENU_IDS / FOLDER_TREE_MENU_IDS / BACKGROUND_MENU_IDS / NEW_MENU_IDS – canonical
//     orderings for CommandMenuItems (wireframe screen 08)
//
// Command ids (default keys):
//   navigate: nav.home (g h) · nav.recent (g r) · nav.starred · nav.shares (g s) ·
//             nav.trash (g t) · nav.settings (g ,) · nav.users · nav.parent (backspace, mod+arrowup) ·
//             nav.back (mod+[) · nav.forward (mod+]) · app.palette (mod+k) ·
//             view.focusFilter (/)
//   select:   select.all (mod+a; emits signal — explorer overrides) · select.none (escape)
//   file:     item.open (enter) · item.openNewTab (mod+enter) · item.quickLook (space) ·
//             item.share (shift+s) · item.copyLink (mod+shift+c) · item.download (mod+shift+d) ·
//             item.rename (f2) · item.reveal · file.newFile (n) · file.newFolder (shift+n) ·
//             file.upload (u) · file.uploadFolder · file.new.{excalidraw,drawio,notes,static-site}
//   organise: item.star (s) · item.tags (t) · item.move (m) · item.duplicate (mod+d) ·
//             item.cut (mod+x) · item.copy (mod+c) · item.paste (mod+v) ·
//             item.trash (delete, mod+backspace) · item.restore · item.purge · trash.empty
//   view:     view.grid (1) · view.compact (2) · view.list (3) · view.columns (4) ·
//             view.thumbBigger (mod+=) · view.thumbSmaller (mod+-) · view.details (i) ·
//             view.sidebar (mod+\)
//   app:      app.undo (mod+z) · app.shortcuts (?)
//
// Scopes: everything is app-scoped; EDITOR_USABLE ids (+ file.new.*) are
// also usable from the editor palette (scopes ["app","editor"]).

import {
  ArrowTurnBackwardIcon,
  CheckmarkSquare02Icon,
  ClipboardPasteIcon,
  Clock01Icon,
  Copy01Icon,
  Delete02Icon,
  Download01Icon,
  Edit02Icon,
  FileAddIcon,
  FilterIcon,
  FolderAddIcon,
  FolderOpenIcon,
  FolderTransferIcon,
  GridViewIcon,
  HashtagIcon,
  Home01Icon,
  InformationCircleIcon,
  KeyboardIcon,
  LayoutThreeColumnIcon,
  LeftToRightListBulletIcon,
  Link04Icon,
  LinkSquare02Icon,
  Location01Icon,
  Menu01Icon,
  RestoreBinIcon,
  Scissor01Icon,
  Search01Icon,
  Settings02Icon,
  Share08Icon,
  SidebarLeftIcon,
  StarIcon,
  Undo02Icon,
  Upload01Icon,
  UserMultipleIcon,
  ViewIcon,
  ZoomInAreaIcon,
} from "@hugeicons/core-free-icons";
import {
  openPalette,
  openShortcutSheet,
  toggleDetails,
  toggleSidebar,
} from "@/components/shell/shellStore";
import { openUploadPicker } from "@/features/upload";
import type { FileKind, ItemRef } from "@/lib/api/client";
import { type Command, type CommandContext, registerCommands } from "@/lib/commands/registry";
import { emitCommandSignal, requestQuickLook } from "@/lib/commands/signals";
import {
  type ExplorerView,
  getExplorerPref,
  setExplorerPref,
  setFolderView,
  stepThumbSize,
  viewKeyFor,
} from "@/lib/explorerPrefs";
import { clearSelection } from "@/lib/selection";
import { undoLast } from "@/lib/undo";
import { getClipboard } from "./clipboard";
import { findFolderMeta, resolveItems } from "./itemCache";
import { getActionsQueryClient, itemActions } from "./useItemActions";

export function targetsOf(ctx: CommandContext): ItemRef[] {
  if (ctx.selection.length) return ctx.selection;
  return ctx.focused ? [ctx.focused] : [];
}

const one = (ctx: CommandContext) => targetsOf(ctx).length === 1;
const some = (ctx: CommandContext) => targetsOf(ctx).length > 0;
const inTrash = (ctx: CommandContext) => ctx.route.startsWith("/trash");
const liveItems = (ctx: CommandContext) => some(ctx) && !inTrash(ctx);
const onePrimary = (ctx: CommandContext) => targetsOf(ctx)[0];
const pasteTarget = (ctx: CommandContext) => ctx.currentFolderId ?? null;
const n = (ctx: CommandContext) => targetsOf(ctx).length;
const itemsLabel = (ctx: CommandContext, verb: string) =>
  n(ctx) > 1 ? `${verb} ${n(ctx)} items` : verb;

let navigateImpl: (to: string) => void = (to) => location.assign(to);
/** AppShell passes react-router's navigate so go-to commands don't reload. */
export function setCommandNavigate(fn: (to: string) => void): void {
  navigateImpl = fn;
}

function go(to: string) {
  navigateImpl(to);
}

const KIND_ITEMS: Array<{ kind: FileKind; label: string }> = [
  { kind: "excalidraw", label: "New Excalidraw drawing" },
  { kind: "drawio", label: "New Draw.io diagram" },
  { kind: "notes", label: "New note" },
  { kind: "static-site", label: "New static site" },
];

const VIEW_ITEMS: Array<{ view: ExplorerView; label: string; key: string; icon: Command["icon"] }> =
  [
    { view: "grid", label: "Grid view", key: "1", icon: GridViewIcon },
    { view: "compact", label: "Compact view", key: "2", icon: Menu01Icon },
    { view: "list", label: "Details view", key: "3", icon: LeftToRightListBulletIcon },
    { view: "columns", label: "Columns view", key: "4", icon: LayoutThreeColumnIcon },
  ];

/** App commands that also make sense from the editor's palette (they act
 *  on the open file, which EditorOverlays sets as the focused item, or
 *  just navigate). Their app keys are NOT active in editors, so the
 *  editor shortcut sheet doesn't list them; editor key handling is
 *  described by EditorOverlays' editor-only overrides. */
const EDITOR_USABLE = new Set([
  "nav.home",
  "nav.recent",
  "nav.starred",
  "nav.shares",
  "nav.trash",
  "nav.settings",
  "nav.shortcutSettings",
  "nav.users",
  "item.reveal",
  "item.share",
  "item.copyLink",
  "item.download",
  "item.rename",
  "item.star",
  "item.tags",
  "item.move",
  "item.duplicate",
  "item.trash",
  "file.newFile",
  "file.newFolder",
  "app.undo",
]);

export const ITEM_MENU_IDS = [
  "item.open",
  "item.openNewTab",
  "item.quickLook",
  "-",
  "item.share",
  "item.copyLink",
  "-",
  "item.star",
  "item.tags",
  "item.move",
  "item.duplicate",
  "item.download",
  "item.cut",
  "item.copy",
  "-",
  "item.rename",
  "view.details",
  "-",
  "item.restore",
  "item.purge",
  "item.trash",
] as const;

export const FOLDER_TREE_MENU_IDS = [
  "item.open",
  "item.openNewTab",
  "-",
  "file.newFile",
  "file.newFolder",
  "file.upload",
  "item.paste",
  "-",
  "item.share",
  "item.copyLink",
  "item.star",
  "item.tags",
  "item.move",
  "item.duplicate",
  "item.download",
  "-",
  "item.rename",
  "-",
  "item.trash",
] as const;

export const BACKGROUND_MENU_IDS = [
  "file.newFile",
  "file.newFolder",
  "file.upload",
  "file.uploadFolder",
  "-",
  "item.paste",
  "-",
  "view.grid",
  "view.compact",
  "view.list",
  "view.columns",
  "-",
  "select.all",
] as const;

export const NEW_MENU_IDS = [
  "file.new.excalidraw",
  "file.new.drawio",
  "file.new.notes",
  "file.new.static-site",
  "-",
  "file.newFolder",
  "-",
  "file.upload",
  "file.uploadFolder",
] as const;

export function registerAppCommands(opts: { isAdmin: () => boolean }): () => void {
  const a = itemActions;
  const cmds: Command[] = [
    // ─── Navigate ─────────────────────────────────────────────────────
    {
      id: "nav.home",
      label: "Go to Home",
      icon: Home01Icon,
      keys: ["g h"],
      group: "navigate",
      run: () => go("/"),
    },
    {
      id: "nav.recent",
      label: "Go to Recent",
      icon: Clock01Icon,
      keys: ["g r"],
      group: "navigate",
      run: () => go("/recent"),
    },
    {
      id: "nav.starred",
      label: "Go to Starred",
      icon: StarIcon,
      group: "navigate",
      run: () => go("/starred"),
    },
    {
      id: "nav.shares",
      label: "Go to Shared links",
      icon: Link04Icon,
      keys: ["g s"],
      group: "navigate",
      run: () => go("/shares"),
    },
    {
      id: "nav.trash",
      label: "Go to Trash",
      icon: Delete02Icon,
      keys: ["g t"],
      group: "navigate",
      run: () => go("/trash"),
    },
    {
      id: "nav.settings",
      label: "Go to Settings",
      icon: Settings02Icon,
      keys: ["g ,"],
      group: "navigate",
      run: () => go("/settings"),
    },
    {
      id: "nav.shortcutSettings",
      label: "Customize keyboard shortcuts",
      icon: KeyboardIcon,
      group: "navigate",
      run: () => go("/settings/shortcuts"),
    },
    {
      id: "nav.users",
      label: "Go to Users",
      icon: UserMultipleIcon,
      group: "navigate",
      when: () => opts.isAdmin(),
      run: () => go("/users"),
    },
    {
      id: "nav.parent",
      label: "Go to parent folder",
      icon: ArrowTurnBackwardIcon,
      keys: ["backspace", "mod+arrowup"],
      group: "navigate",
      when: (ctx) => typeof ctx.currentFolderId === "string",
      run: (ctx) => {
        const parent = ctx.currentFolderId
          ? (findFolderMetaSafe(ctx.currentFolderId)?.parentId ?? null)
          : null;
        go(parent ? `/folders/${parent}` : "/");
      },
    },
    {
      id: "nav.back",
      label: "Back",
      keys: ["mod+["],
      group: "navigate",
      palette: false,
      run: () => history.back(),
    },
    {
      id: "nav.forward",
      label: "Forward",
      keys: ["mod+]"],
      group: "navigate",
      palette: false,
      run: () => history.forward(),
    },
    {
      id: "app.palette",
      label: "Command palette",
      icon: Search01Icon,
      keys: ["mod+k"],
      group: "navigate",
      palette: false,
      run: () => openPalette(),
    },
    {
      id: "view.focusFilter",
      label: "Filter current view",
      icon: FilterIcon,
      keys: ["/"],
      group: "navigate",
      when: () => !!document.querySelector("[data-toolbar-search]"),
      run: () => {
        const el = document.querySelector<HTMLInputElement>("[data-toolbar-search]");
        el?.focus();
        el?.select();
      },
    },

    // ─── Select ───────────────────────────────────────────────────────
    {
      id: "select.all",
      label: "Select all",
      icon: CheckmarkSquare02Icon,
      keys: ["mod+a"],
      group: "select",
      // Pages listen for the signal (explorer, library lists, Shared links,
      // Users table) so ⌘A works without the list having focus.
      when: (ctx) =>
        ctx.currentFolderId !== undefined ||
        /^\/(recent|starred|trash|tags|shares)/.test(ctx.route) ||
        /^\/users\/?(users)?$/.test(ctx.route),
      run: () => emitCommandSignal("select.all"),
    },
    {
      id: "select.none",
      label: "Clear selection",
      keys: ["escape"],
      group: "select",
      when: (ctx) => ctx.selection.length > 0,
      run: () => clearSelection(),
    },

    // ─── File ─────────────────────────────────────────────────────────
    {
      id: "item.open",
      label: "Open",
      icon: FolderOpenIcon,
      keys: ["enter"],
      group: "file",
      when: (ctx) => some(ctx) && !inTrash(ctx),
      run: (ctx) => a.open(ctx.focused ?? onePrimary(ctx)),
    },
    {
      id: "item.openNewTab",
      label: "Open in new tab",
      icon: LinkSquare02Icon,
      keys: ["mod+enter"],
      group: "file",
      when: liveItems,
      run: (ctx) => {
        for (const r of targetsOf(ctx).slice(0, 10)) a.open(r, { newTab: true });
      },
    },
    {
      id: "item.quickLook",
      label: "Quick look",
      icon: ViewIcon,
      keys: ["space"],
      group: "file",
      when: (ctx) => liveItems(ctx) && ctx.currentFolderId !== undefined,
      run: (ctx) => requestQuickLook(ctx.focused ?? onePrimary(ctx)),
    },
    {
      id: "item.reveal",
      label: "Reveal in folder",
      icon: Location01Icon,
      group: "file",
      when: (ctx) => one(ctx) && !inTrash(ctx) && ctx.currentFolderId === undefined,
      run: (ctx) => a.reveal(onePrimary(ctx)),
    },
    {
      id: "item.share",
      label: "Share…",
      icon: Share08Icon,
      keys: ["shift+s"],
      group: "file",
      when: liveItems,
      disabledReason: (ctx) => (n(ctx) > 1 ? "Share one item at a time" : null),
      run: (ctx) => a.share(onePrimary(ctx)),
    },
    {
      id: "item.copyLink",
      label: "Copy link",
      icon: Link04Icon,
      keys: ["mod+shift+c"],
      group: "file",
      when: liveItems,
      disabledReason: (ctx) => (n(ctx) > 1 ? "Copy a link for one item at a time" : null),
      run: (ctx) => a.copyLink(onePrimary(ctx)),
    },
    {
      id: "item.download",
      label: (ctx) =>
        n(ctx) > 1 || targetsOf(ctx)[0]?.type === "folder" ? "Download as zip" : "Download",
      icon: Download01Icon,
      keys: ["mod+shift+d"],
      group: "file",
      when: liveItems,
      run: (ctx) => a.download(targetsOf(ctx)),
    },
    {
      id: "item.rename",
      label: "Rename",
      icon: Edit02Icon,
      keys: ["f2"],
      group: "file",
      when: liveItems,
      disabledReason: (ctx) => (n(ctx) > 1 ? "Rename one item at a time" : null),
      run: (ctx) => a.renameDialog(onePrimary(ctx)),
    },
    {
      id: "file.newFile",
      label: "New file…",
      icon: FileAddIcon,
      keys: ["n"],
      group: "file",
      when: (ctx) => !inTrash(ctx),
      run: (ctx) => void a.newFile(ctx.currentFolderId ?? null),
    },
    ...KIND_ITEMS.map(
      ({ kind, label }): Command => ({
        id: `file.new.${kind}`,
        label,
        icon: FileAddIcon,
        group: "file",
        run: (ctx) => void a.newFile(ctx.currentFolderId ?? null, kind),
      }),
    ),
    {
      id: "file.newFolder",
      label: "New folder…",
      icon: FolderAddIcon,
      keys: ["shift+n"],
      group: "file",
      when: (ctx) => !inTrash(ctx),
      run: (ctx) => a.newFolder(ctx.currentFolderId ?? null),
    },
    {
      id: "file.upload",
      label: "Upload files…",
      icon: Upload01Icon,
      keys: ["u"],
      group: "file",
      when: (ctx) => !inTrash(ctx),
      run: (ctx) => openUploadPicker({ folderId: ctx.currentFolderId ?? null }),
    },
    {
      id: "file.uploadFolder",
      label: "Upload folder…",
      icon: Upload01Icon,
      group: "file",
      when: (ctx) => !inTrash(ctx),
      run: (ctx) => openUploadPicker({ folderId: ctx.currentFolderId ?? null, directory: true }),
    },

    // ─── Organise ─────────────────────────────────────────────────────
    {
      id: "item.star",
      label: (ctx) => {
        const infos = targetsOf(ctx).map((r) => starredOf(r));
        return infos.length && infos.every(Boolean) ? "Remove from Starred" : "Add to Starred";
      },
      icon: StarIcon,
      keys: ["s"],
      group: "organise",
      when: liveItems,
      run: (ctx) => a.toggleStar(targetsOf(ctx)),
    },
    {
      id: "item.tags",
      label: "Tags…",
      icon: HashtagIcon,
      keys: ["t"],
      group: "organise",
      when: liveItems,
      run: (ctx) => a.editTags(targetsOf(ctx)),
    },
    {
      id: "item.move",
      label: (ctx) => `${itemsLabel(ctx, "Move")} to…`,
      icon: FolderTransferIcon,
      keys: ["m"],
      group: "organise",
      when: liveItems,
      run: (ctx) => a.moveDialog(targetsOf(ctx)),
    },
    {
      id: "item.duplicate",
      label: "Duplicate",
      icon: Copy01Icon,
      keys: ["mod+d"],
      group: "organise",
      when: liveItems,
      run: (ctx) => a.duplicate(targetsOf(ctx)),
    },
    {
      id: "item.cut",
      label: "Cut",
      icon: Scissor01Icon,
      keys: ["mod+x"],
      group: "organise",
      when: liveItems,
      run: (ctx) => a.cut(targetsOf(ctx)),
    },
    {
      id: "item.copy",
      label: "Copy",
      icon: Copy01Icon,
      keys: ["mod+c"],
      group: "organise",
      when: liveItems,
      run: (ctx) => a.copy(targetsOf(ctx)),
    },
    {
      id: "item.paste",
      label: () => {
        const c = getClipboard();
        return c.items.length > 1 ? `Paste ${c.items.length} items` : "Paste";
      },
      icon: ClipboardPasteIcon,
      keys: ["mod+v"],
      group: "organise",
      when: (ctx) => getClipboard().items.length > 0 && ctx.currentFolderId !== undefined,
      run: (ctx) => a.paste(pasteTarget(ctx)),
    },
    {
      id: "item.trash",
      label: (ctx) => `${itemsLabel(ctx, "Move")} to Trash`,
      icon: Delete02Icon,
      keys: ["delete", "mod+backspace"],
      group: "organise",
      destructive: true,
      when: liveItems,
      run: (ctx) => a.trash(targetsOf(ctx)),
    },
    {
      id: "item.restore",
      label: (ctx) => itemsLabel(ctx, "Restore"),
      icon: RestoreBinIcon,
      group: "organise",
      when: (ctx) => some(ctx) && inTrash(ctx),
      run: (ctx) => a.restore(targetsOf(ctx)),
    },
    {
      id: "item.purge",
      label: "Delete forever…",
      icon: Delete02Icon,
      keys: ["delete", "mod+backspace"],
      group: "organise",
      destructive: true,
      when: (ctx) => some(ctx) && inTrash(ctx),
      run: (ctx) => a.purge(targetsOf(ctx)),
    },
    {
      id: "trash.empty",
      label: "Empty Trash…",
      icon: Delete02Icon,
      group: "organise",
      destructive: true,
      run: () => a.emptyTrash(),
    },

    // ─── View ─────────────────────────────────────────────────────────
    ...VIEW_ITEMS.map(
      ({ view, label, key, icon }): Command => ({
        id: `view.${view}`,
        label,
        icon,
        keys: [key],
        group: "view",
        when: (ctx) =>
          ctx.currentFolderId !== undefined || /^\/(recent|starred|tags)/.test(ctx.route),
        run: (ctx) => setFolderView(viewKeyFor(ctx), view),
      }),
    ),
    {
      id: "view.thumbBigger",
      label: "Larger thumbnails",
      icon: ZoomInAreaIcon,
      keys: ["mod+="],
      group: "view",
      when: (ctx) =>
        ctx.currentFolderId !== undefined || /^\/(recent|starred|tags)/.test(ctx.route),
      run: () => setExplorerPref("thumbSize", stepThumbSize(getExplorerPref("thumbSize"), 1)),
    },
    {
      id: "view.thumbSmaller",
      label: "Smaller thumbnails",
      icon: ZoomInAreaIcon,
      keys: ["mod+-"],
      group: "view",
      when: (ctx) =>
        ctx.currentFolderId !== undefined || /^\/(recent|starred|tags)/.test(ctx.route),
      run: () => setExplorerPref("thumbSize", stepThumbSize(getExplorerPref("thumbSize"), -1)),
    },
    {
      id: "view.details",
      label: "Details panel",
      icon: InformationCircleIcon,
      keys: ["i"],
      group: "view",
      run: () => toggleDetails(),
    },
    {
      id: "view.sidebar",
      label: "Toggle sidebar",
      icon: SidebarLeftIcon,
      keys: ["mod+\\"],
      group: "view",
      run: () => toggleSidebar(),
    },

    // ─── App ──────────────────────────────────────────────────────────
    {
      id: "app.undo",
      label: "Undo",
      icon: Undo02Icon,
      keys: ["mod+z"],
      group: "app",
      run: () => void undoLast(),
    },
    {
      id: "app.shortcuts",
      label: "Keyboard shortcuts",
      icon: KeyboardIcon,
      keys: ["?"],
      group: "app",
      run: () => openShortcutSheet(),
    },
  ];
  return registerCommands(
    cmds.map((c) =>
      EDITOR_USABLE.has(c.id) || c.id.startsWith("file.new.")
        ? { ...c, scopes: ["app", "editor"] }
        : c,
    ),
  );
}

function findFolderMetaSafe(id: string) {
  const qc = getActionsQueryClient();
  return qc ? findFolderMeta(qc, id) : undefined;
}

function starredOf(ref: ItemRef): boolean {
  const qc = getActionsQueryClient();
  if (!qc) return false;
  return !!resolveItems(qc, [ref])[0]?.starredAt;
}
