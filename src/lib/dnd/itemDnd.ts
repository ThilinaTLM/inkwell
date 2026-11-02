// Internal item drag & drop (native HTML5 DnD).
//
// PUBLIC CONTRACT
//   ITEM_MIME = "application/x-inkwell-items"      – JSON ItemRef[]
//   startItemDrag(e: DragEvent | React.DragEvent, refs: ItemRef[], opts?: { names?: string[];
//                 thumbUrl?: string | null }): void
//       – call from an item's `onDragStart`; sets the payload, a stacked drag
//         image with the count, and starts a drag session.
//   useItemDropTargets(): void
//       – ref-counted document-level delegation; mounted by every explorer view.
//         Any element (or ancestor) carrying one of these attributes is a target:
//           data-drop-folder="<id>|root"   move into that folder (Alt = duplicate)
//           data-drop-trash=""             move to Trash
//           data-drop-name="<label>"       optional tooltip label
//         Spring-loading (700 ms hover):
//           data-spring-folder="<id>"      dispatches `inkwell:spring` on the element
//           data-spring-nav="<id>|root"    navigates into the folder
//         During a drag the hovered target gets data-drop-over="true" (valid) or
//         data-drop-invalid="true" (self / descendant / no-op); a tooltip follows
//         the cursor ("Move 3 items to X · hold ⌥ to duplicate").
//   useDragSession(): { refs: ItemRef[] } | null  – for dimming drag sources
//   isDraggingItems(): boolean
//
// OS file drags (dataTransfer has "Files") are ignored here — the upload
// module's `useGlobalFileDrop` handles those on the same data attributes.

import type { DragEvent as ReactDragEvent } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  descendantFolderIds,
  findFolderMeta,
  getFoldersCached,
  resolveItems,
} from "@/features/actions/itemCache";
import { getActionsQueryClient, itemActions } from "@/features/actions/useItemActions";
import { confirmDialog } from "@/features/dialogs/dialogStore";
import { dragHasFiles } from "@/features/upload";
import type { ItemRef } from "@/lib/api/client";
import { getExplorerPref } from "@/lib/explorerPrefs";
import { createStore, useStore } from "@/lib/store";

export const ITEM_MIME = "application/x-inkwell-items";
export const SPRING_EVENT = "inkwell:spring";
const SPRING_MS = 700;
const TARGET_SELECTOR = "[data-drop-folder],[data-drop-trash]";
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const ALT = IS_MAC ? "⌥" : "Alt";

interface Session {
  refs: ItemRef[];
  /** Folder ids that cannot receive the drop (dragged folders + descendants). */
  invalid: Set<string>;
  /** Parent of every dragged item (for no-op detection). */
  parents: Array<string | null>;
}

const sessionStore = createStore<Session | null>(null);

export function useDragSession(): Session | null {
  return useStore(sessionStore);
}

export function useIsDragSource(key: string): boolean {
  return useStore(sessionStore, (s) => !!s && s.refs.some((r) => `${r.type}:${r.id}` === key));
}

export function isDraggingItems(): boolean {
  return sessionStore.get() !== null;
}

function plural(n: number) {
  return n === 1 ? "1 item" : `${n} items`;
}

// ─── Drag start ─────────────────────────────────────────────────────────

export function startItemDrag(
  e: DragEvent | ReactDragEvent,
  refs: ItemRef[],
  opts: { names?: string[]; thumbUrl?: string | null } = {},
): void {
  const dt = e.dataTransfer;
  if (!dt || refs.length === 0) return;
  const qc = getActionsQueryClient();
  const infos = qc ? resolveItems(qc, refs) : [];
  const names = opts.names ?? infos.map((i) => i.name);
  dt.effectAllowed = "copyMove";
  dt.setData(ITEM_MIME, JSON.stringify(refs));
  dt.setData("text/plain", names.join("\n"));

  const folderIds = refs.filter((r) => r.type === "folder").map((r) => r.id);
  const invalid =
    qc && folderIds.length
      ? descendantFolderIds(getFoldersCached(qc), folderIds)
      : new Set(folderIds);
  sessionStore.set({ refs, invalid, parents: infos.map((i) => i.parentId) });

  const ghost = buildGhost(names, refs.length, opts.thumbUrl ?? null);
  document.body.appendChild(ghost);
  try {
    dt.setDragImage(ghost, 24, 24);
  } catch {
    /* unsupported */
  }
  setTimeout(() => ghost.remove(), 0);
}

function buildGhost(names: string[], count: number, thumbUrl: string | null): HTMLElement {
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText =
    "position:fixed;top:-1000px;left:-1000px;width:150px;height:104px;pointer-events:none;z-index:-1;";
  const cards = Math.min(3, count);
  const card = (rot: number, front: boolean) => {
    const c = document.createElement("div");
    c.style.cssText = `position:absolute;left:10px;top:10px;width:124px;height:80px;border-radius:9px;
      background:var(--card, #1f1f24);border:1px solid var(--border, rgba(255,255,255,.18));
      box-shadow:0 10px 24px rgba(0,0,0,.35);transform:rotate(${rot}deg);overflow:hidden;
      display:flex;flex-direction:column;justify-content:flex-end;`;
    if (front) {
      if (thumbUrl) {
        const img = document.createElement("img");
        img.src = thumbUrl;
        img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;";
        c.appendChild(img);
      }
      const label = document.createElement("div");
      label.textContent = names[0] ?? "";
      label.style.cssText =
        "position:relative;padding:4px 7px;font:600 11px system-ui,sans-serif;color:var(--foreground,#efe9dc);background:color-mix(in srgb, var(--card, #1f1f24) 85%, transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      c.appendChild(label);
    }
    return c;
  };
  if (cards >= 3) root.appendChild(card(-6, false));
  if (cards >= 2) root.appendChild(card(3, false));
  root.appendChild(card(-2, true));
  if (count > 1) {
    const badge = document.createElement("span");
    badge.textContent = String(count);
    badge.style.cssText =
      "position:absolute;top:2px;right:6px;background:var(--primary,#f5893a);color:var(--primary-foreground,#1c1814);border-radius:999px;font:800 12px system-ui,sans-serif;padding:1px 8px;";
    root.appendChild(badge);
  }
  return root;
}

// ─── Drop targets (document delegation) ─────────────────────────────────

type Target =
  | { kind: "trash"; el: Element; name: string }
  | { kind: "folder"; el: Element; folderId: string | null; name: string };

function resolveTarget(t: EventTarget | null): Target | null {
  const el = t instanceof Element ? t.closest(TARGET_SELECTOR) : null;
  if (!el) return null;
  if (el.hasAttribute("data-drop-trash")) return { kind: "trash", el, name: "Trash" };
  const raw = el.getAttribute("data-drop-folder");
  const folderId = !raw || raw === "root" ? null : raw;
  let name = el.getAttribute("data-drop-name") ?? "";
  if (!name) {
    const qc = getActionsQueryClient();
    name = folderId === null ? "Home" : ((qc && findFolderMeta(qc, folderId)?.name) ?? "folder");
  }
  return { kind: "folder", el, folderId, name };
}

type Verdict = { ok: true; label: string } | { ok: false; label: string | null };

function judge(s: Session, t: Target, alt: boolean): Verdict {
  const n = plural(s.refs.length);
  if (t.kind === "trash") return { ok: true, label: `Move ${n} to Trash` };
  if (t.folderId !== null && s.invalid.has(t.folderId)) {
    return { ok: false, label: "Can't move a folder into itself" };
  }
  const dupe = alt && getExplorerPref("altDrag") === "duplicate";
  if (alt) return { ok: true, label: `${dupe ? "Duplicate" : "Copy"} ${n} into ${t.name}` };
  const movable = s.parents.filter((p) => p !== t.folderId).length;
  if (movable === 0) return { ok: false, label: null };
  return { ok: true, label: `Move ${plural(movable)} to ${t.name} · hold ${ALT} to duplicate` };
}

let tooltip: HTMLDivElement | null = null;

function showTooltip(text: string | null, x: number, y: number, invalid: boolean) {
  if (!text) {
    hideTooltip();
    return;
  }
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.setAttribute("role", "status");
    tooltip.setAttribute("data-drag-tooltip", "");
    tooltip.style.cssText =
      "position:fixed;z-index:9999;pointer-events:none;padding:5px 9px;border-radius:7px;font:12px system-ui,sans-serif;white-space:nowrap;background:#000;color:#efe9dc;border:1px solid rgba(255,255,255,.18);box-shadow:0 8px 20px rgba(0,0,0,.4);";
    document.body.appendChild(tooltip);
  }
  tooltip.textContent = text;
  tooltip.style.opacity = invalid ? "0.75" : "1";
  const w = tooltip.offsetWidth;
  const left = Math.min(x + 16, window.innerWidth - w - 8);
  tooltip.style.transform = `translate(${Math.max(8, left)}px, ${y + 20}px)`;
  tooltip.style.left = "0";
  tooltip.style.top = "0";
}

function hideTooltip() {
  tooltip?.remove();
  tooltip = null;
}

let mounts = 0;
let teardown: (() => void) | null = null;

function install(): () => void {
  let overEl: Element | null = null;
  let springEl: Element | null = null;
  let springTimer: ReturnType<typeof setTimeout> | null = null;

  const clearOver = () => {
    overEl?.removeAttribute("data-drop-over");
    overEl?.removeAttribute("data-drop-invalid");
    overEl = null;
  };
  const clearSpring = () => {
    if (springTimer) clearTimeout(springTimer);
    springTimer = null;
    springEl = null;
  };
  const end = () => {
    clearOver();
    clearSpring();
    hideTooltip();
    if (sessionStore.get()) sessionStore.set(null);
  };

  const armSpring = (el: Element | null, allowed: boolean) => {
    const springable =
      el && allowed && (el.hasAttribute("data-spring-folder") || el.hasAttribute("data-spring-nav"))
        ? el
        : null;
    if (springable === springEl) return;
    clearSpring();
    if (!springable) return;
    springEl = springable;
    springTimer = setTimeout(() => {
      springTimer = null;
      const target = springEl;
      if (!target || !sessionStore.get()) return;
      if (target.hasAttribute("data-spring-folder")) {
        target.dispatchEvent(
          new CustomEvent(SPRING_EVENT, {
            bubbles: true,
            detail: { folderId: target.getAttribute("data-spring-folder") },
          }),
        );
      }
      if (target.hasAttribute("data-spring-nav")) {
        const raw = target.getAttribute("data-spring-nav");
        springNavigate(raw && raw !== "root" ? raw : null);
      }
    }, SPRING_MS);
  };

  const onOver = (e: DragEvent) => {
    const s = sessionStore.get();
    if (!s || dragHasFiles(e.dataTransfer)) return;
    const t = resolveTarget(e.target);
    if (!t) {
      clearOver();
      clearSpring();
      showTooltip(null, 0, 0, false);
      return;
    }
    const v = judge(s, t, e.altKey);
    if (overEl !== t.el) {
      clearOver();
      overEl = t.el;
    }
    if (v.ok) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = e.altKey ? "copy" : "move";
      t.el.setAttribute("data-drop-over", "true");
      t.el.removeAttribute("data-drop-invalid");
    } else {
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
      t.el.removeAttribute("data-drop-over");
      if (v.label) t.el.setAttribute("data-drop-invalid", "true");
    }
    armSpring(
      t.el,
      v.ok || (t.kind === "folder" && !(t.folderId !== null && s.invalid.has(t.folderId))),
    );
    showTooltip(v.label, e.clientX, e.clientY, !v.ok);
  };

  const onLeave = (e: DragEvent) => {
    if (!sessionStore.get()) return;
    if (!e.relatedTarget) {
      clearOver();
      clearSpring();
      hideTooltip();
    }
  };

  const onDrop = (e: DragEvent) => {
    const s = sessionStore.get();
    if (!s || dragHasFiles(e.dataTransfer)) return;
    const t = resolveTarget(e.target);
    const alt = e.altKey;
    end();
    if (!t) return;
    const v = judge(s, t, alt);
    if (!v.ok) return;
    e.preventDefault();
    e.stopPropagation();
    void performDrop(s, t, alt);
  };

  // A drag whose source element unmounted (spring-loaded navigation)
  // never fires `dragend` on the document; the first mouse move after
  // the drag ends cleans up instead (no mouse events fire during DnD).
  const onMouseMove = () => {
    if (sessionStore.get()) end();
  };

  document.addEventListener("dragover", onOver);
  document.addEventListener("dragleave", onLeave);
  document.addEventListener("drop", onDrop);
  document.addEventListener("dragend", end);
  document.addEventListener("mousemove", onMouseMove);
  window.addEventListener("blur", end);
  return () => {
    document.removeEventListener("dragover", onOver);
    document.removeEventListener("dragleave", onLeave);
    document.removeEventListener("drop", onDrop);
    document.removeEventListener("dragend", end);
    document.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("blur", end);
    end();
  };
}

let springNavigate: (folderId: string | null) => void = (id) => {
  if (id) itemActions.open({ type: "folder", id });
  else location.assign("/");
};

async function performDrop(s: Session, t: Target, alt: boolean): Promise<void> {
  if (t.kind === "trash") {
    await itemActions.trash(s.refs);
    return;
  }
  if (alt) {
    if (getExplorerPref("altDrag") === "ask") {
      const ok = await confirmDialog({
        title: `Duplicate ${plural(s.refs.length)} into “${t.name}”?`,
        confirmLabel: "Duplicate",
        destructive: false,
      });
      if (!ok) return;
    }
    await itemActions.duplicate(s.refs, t.folderId);
    return;
  }
  const refs = s.refs.filter((_, i) => s.parents[i] !== t.folderId);
  if (refs.length) await itemActions.move(refs, t.folderId);
}

export function useItemDropTargets(): void {
  const navigate = useNavigate();
  useEffect(() => {
    springNavigate = (id) => navigate(id ? `/folders/${id}` : "/");
  }, [navigate]);
  useEffect(() => {
    if (mounts++ === 0) teardown = install();
    return () => {
      if (--mounts === 0) {
        teardown?.();
        teardown = null;
      }
    };
  }, []);
}
