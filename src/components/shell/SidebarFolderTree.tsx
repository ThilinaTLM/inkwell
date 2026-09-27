// Sidebar folder tree.
//
// - Lazy: only expanded branches render their children.
// - Expansion persists in localStorage (`inkwell.sidebar.expanded`) and
//   auto-expands to reveal the current folder.
// - Right-click opens the folder menu (CommandMenuItems with the node as
//   the command-context selection and current folder).
// - Drop-target convention (DnD is implemented by explorer/upload):
//     data-drop-folder="<id>"  data-spring-folder="<id>"
//   A `inkwell:spring` CustomEvent (detail { folderId }) dispatched on a
//   node expands it (spring-loading after 700ms drag hover).

import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  FolderLibraryIcon,
  FolderOpenIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { FOLDER_TREE_MENU_IDS } from "@/features/actions/itemCommands";
import type { FolderMeta } from "@/lib/api/client";
import { CommandMenuItems } from "@/lib/commands/CommandMenuItems";
import { createStore, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const SPRING_EVENT = "inkwell:spring";
const EXPANDED_KEY = "inkwell.sidebar.expanded";

function readExpanded(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

const expandedStore = createStore<Set<string>>(
  typeof localStorage === "undefined" ? new Set() : readExpanded(),
);

function setExpanded(id: string, open: boolean) {
  expandedStore.set((prev) => {
    if (prev.has(id) === open) return prev;
    const next = new Set(prev);
    if (open) next.add(id);
    else next.delete(id);
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next].slice(-500)));
    } catch {
      /* ignore */
    }
    return next;
  });
}

export function SidebarFolderTree({
  folders,
  currentFolderId,
  onNavigate,
}: {
  folders: FolderMeta[];
  currentFolderId: string | null | undefined;
  onNavigate?: () => void;
}) {
  const children = useMemo(() => {
    const m = new Map<string | null, FolderMeta[]>();
    for (const f of folders) {
      const arr = m.get(f.parentId) ?? [];
      arr.push(f);
      m.set(f.parentId, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    }
    return m;
  }, [folders]);

  // Reveal the current folder.
  useEffect(() => {
    if (!currentFolderId) return;
    const byId = new Map(folders.map((f) => [f.id, f]));
    let cur = byId.get(currentFolderId);
    let guard = 0;
    while (cur?.parentId && guard++ < 64) {
      setExpanded(cur.parentId, true);
      cur = byId.get(cur.parentId);
    }
  }, [currentFolderId, folders]);

  const roots = children.get(null) ?? [];
  if (!roots.length) {
    return <div className="px-2.5 py-1 text-xs text-muted-foreground/70">No folders yet</div>;
  }
  return (
    <ul aria-label="Folders" className="flex flex-col">
      {roots.map((f) => (
        <TreeNode
          key={f.id}
          folder={f}
          depth={0}
          childMap={children}
          currentFolderId={currentFolderId}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

const TreeNode = memo(function TreeNode({
  folder,
  depth,
  childMap,
  currentFolderId,
  onNavigate,
}: {
  folder: FolderMeta;
  depth: number;
  childMap: Map<string | null, FolderMeta[]>;
  currentFolderId: string | null | undefined;
  onNavigate?: () => void;
}) {
  const open = useStore(expandedStore, (s) => s.has(folder.id));
  const kids = childMap.get(folder.id) ?? [];
  const hasChildren = kids.length > 0 || folder.subfolderCount > 0;
  const active = currentFolderId === folder.id;
  const rowRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const onSpring = () => setExpanded(folder.id, true);
    el.addEventListener(SPRING_EVENT, onSpring);
    return () => el.removeEventListener(SPRING_EVENT, onSpring);
  }, [folder.id]);

  const ref = { type: "folder" as const, id: folder.id };

  return (
    <li>
      <ContextMenu onOpenChange={setMenuOpen}>
        <ContextMenuTrigger
          render={
            <div
              ref={rowRef}
              data-drop-folder={folder.id}
              data-spring-folder={folder.id}
              data-active={active}
              data-menu-open={menuOpen}
              className={cn(
                "group/tree relative flex h-[26px] items-center gap-1 rounded-md pr-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                "data-[active=true]:bg-muted data-[active=true]:font-medium data-[active=true]:text-foreground",
                "data-[menu-open=true]:bg-muted",
                "data-[file-drop-over=true]:bg-accent data-[file-drop-over=true]:text-accent-foreground data-[file-drop-over=true]:outline-dashed data-[file-drop-over=true]:outline-[1.5px] data-[file-drop-over=true]:outline-primary",
                "data-[drop-over=true]:bg-accent data-[drop-over=true]:text-accent-foreground data-[drop-over=true]:outline-dashed data-[drop-over=true]:outline-[1.5px] data-[drop-over=true]:outline-primary",
                "data-[drop-invalid=true]:opacity-50",
              )}
              style={{ paddingLeft: 4 + depth * 14 }}
            />
          }
        >
          {active ? (
            <span
              aria-hidden
              className="absolute top-1.5 bottom-1.5 -left-2 w-[3px] rounded-full bg-primary"
            />
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
            onClick={() => setExpanded(folder.id, !open)}
            className={cn(
              "grid size-4 shrink-0 place-items-center rounded text-muted-foreground/70 hover:bg-border",
              !hasChildren && "invisible",
            )}
          >
            <HugeiconsIcon
              icon={open ? ArrowDown01Icon : ArrowRight01Icon}
              strokeWidth={2}
              className="size-3"
            />
          </button>
          <Link
            to={`/folders/${folder.id}`}
            onClick={onNavigate}
            className="flex min-w-0 flex-1 items-center gap-1.5 outline-none focus-visible:underline"
            title={folder.name}
          >
            <HugeiconsIcon
              icon={active ? FolderOpenIcon : FolderLibraryIcon}
              strokeWidth={1.7}
              className="size-4 shrink-0 text-folder"
            />
            <span className="truncate">{folder.name}</span>
          </Link>
          {folder.fileCount > 0 ? (
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/70">
              {folder.fileCount}
            </span>
          ) : null}
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-60">
          {menuOpen ? (
            <CommandMenuItems
              ids={FOLDER_TREE_MENU_IDS}
              as="context"
              ctx={{
                selection: [ref],
                focused: ref,
                currentFolderId: folder.id,
                route: `/folders/${folder.id}`,
              }}
            />
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
      {open && kids.length ? (
        <ul className="flex flex-col">
          {kids.map((k) => (
            <TreeNode
              key={k.id}
              folder={k}
              depth={depth + 1}
              childMap={childMap}
              currentFolderId={currentFolderId}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
});
