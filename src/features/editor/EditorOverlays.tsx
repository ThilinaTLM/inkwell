// Global overlays + the narrow editor keymap for owner editor routes.
//
// Editors (`/f/:id`) render outside `AppShell`, so the shell's command
// palette, shortcut sheet and dialog host aren't mounted there. This
// component mounts them for the editor page (the two never co-exist —
// `/f/:id` is not a child of the shell layout route — so nothing is
// double-mounted), binds the item-actions runtime, registers the app
// command set and points the command context at the open file (as the
// `focused` item), so palette actions such as Star, Tags or Move act on
// the file being edited.
//
// Keymap — deliberately narrow, never single keys (editors own those):
//   • mod+K         command palette (capture phase: wins over Excalidraw's
//                   "add link" chord; BlockNote doesn't bind it)
//   • mod+shift+/   shortcut sheet (plain `?` is Excalidraw's help and a
//                   character in Notes)
//   • mod+[ / F2 / Esc Esc are handled by `EditorHeader`.
//
// `overrides` re-register command ids with editor semantics (e.g.
// `item.trash` also leaves the editor); newest registration wins.

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { ShortcutSheet } from "@/components/shell/ShortcutSheet";
import { openPalette, openShortcutSheet } from "@/components/shell/shellStore";
import { useMe } from "@/data/auth";
import { registerAppCommands, setCommandNavigate } from "@/features/actions/itemCommands";
import { bindItemActionsRuntime } from "@/features/actions/useItemActions";
import { DialogHost } from "@/features/dialogs/DialogHost";
import type { ItemRef } from "@/lib/api/client";
import { type Command, registerCommands, setCommandContext } from "@/lib/commands/registry";
import { clearSelection, setSelection } from "@/lib/selection";

export interface EditorOverlaysProps {
  /** The open file; becomes the command context's focused item. */
  file: ItemRef | null;
  /** Editor-specific command overrides (read through a ref; registered once). */
  overrides?: Command[];
}

export function EditorOverlays({ file, overrides }: EditorOverlaysProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const me = useMe();
  const isAdminRef = useRef(false);
  isAdminRef.current = !!me.data?.isAdmin;

  // Bind before children render so the palette works on first paint.
  bindItemActionsRuntime({ qc, navigate });

  const overridesRef = useRef(overrides ?? []);
  overridesRef.current = overrides ?? [];
  const overrideIds = (overrides ?? []).map((c) => c.id).join(",");

  // Re-register only when the set of overridden ids changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: overrideIds is the intended trigger
  useEffect(() => {
    setCommandNavigate((to) => navigate(to));
    const offApp = registerAppCommands({ isAdmin: () => isAdminRef.current });
    // Proxy each override through the ref so handler identity changes
    // don't re-register (which would reorder the registry).
    const live = (id: string) => overridesRef.current.find((o) => o.id === id);
    // Tagged editor-only: the palette/sheet treat their `keys` as the
    // editor's real bindings (see Command.scopes in the registry).
    const palette: Command = {
      id: "app.palette",
      label: "Command palette",
      keys: ["mod+k"],
      group: "navigate",
      palette: false,
      run: () => openPalette(),
    };
    const base = overridesRef.current.some((o) => o.id === palette.id)
      ? overridesRef.current
      : [...overridesRef.current, palette];
    const proxied: Command[] = base.map((c) => ({
      ...c,
      scopes: ["editor"],
      label: (ctx) => {
        const l = live(c.id)?.label ?? c.label;
        return typeof l === "function" ? l(ctx) : l;
      },
      run: (ctx) => (live(c.id) ?? c).run(ctx),
    }));
    const offOverrides = registerCommands(proxied);
    return () => {
      offOverrides();
      offApp();
    };
  }, [navigate, overrideIds]);

  const fileKey = file ? `${file.type}:${file.id}` : "";
  useEffect(() => {
    setCommandContext({ route: pathname, currentFolderId: undefined });
    const [type, id] = fileKey.split(":") as [ItemRef["type"], string];
    setSelection({ scope: "editor", items: [], focused: id ? { type, id } : null });
    return () => clearSelection();
  }, [pathname, fileKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      if (!e.shiftKey && e.code === "KeyK") {
        e.preventDefault();
        e.stopPropagation();
        openPalette();
      } else if (e.shiftKey && e.code === "Slash") {
        e.preventDefault();
        e.stopPropagation();
        openShortcutSheet();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <>
      <CommandPalette />
      <ShortcutSheet />
      <DialogHost />
    </>
  );
}
