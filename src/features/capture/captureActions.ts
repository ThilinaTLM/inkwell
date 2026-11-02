// Capture helpers: create a note from typed text, or a blank file, and tell the
// user about it with Open / Undo. Everything lands in `folderId` (null = Inbox).

import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidations } from "@/data/invalidations";
import { pushRecentDestination } from "@/features/actions/recentDestinations";
import { type FileKind, type FileMeta, files, items } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
import { pushUndo, runUndo } from "@/lib/undo";

export type CaptureKind = Extract<FileKind, "notes" | "excalidraw" | "drawio">;
type Navigate = (to: string) => void;

const TITLE_MAX = 60;

/** Note title = first non-empty line, markdown heading marks stripped, ~60 chars. */
export function noteTitleFromText(text: string): string {
  const first =
    text
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*#{1,6}\s+/, "").trim())
      .find(Boolean) ?? "";
  if (!first) return "Untitled note";
  if (first.length <= TITLE_MAX) return first;
  const cut = first.slice(0, TITLE_MAX);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 30 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

function shortDate(d = new Date()): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Sensible default names; renaming happens in the editor title. */
export function defaultCaptureName(kind: CaptureKind): string {
  switch (kind) {
    case "notes":
      return "Untitled note";
    case "excalidraw":
      return `Untitled board · ${shortDate()}`;
    case "drawio":
      return `Untitled diagram · ${shortDate()}`;
  }
}

export function destinationLabel(folderName: string | null | undefined): string {
  return folderName ?? "Inbox";
}

function undoCreate(qc: QueryClient, id: string) {
  return async () => {
    // A just-captured file shouldn't linger in Trash after Undo.
    const ref = [{ type: "file" as const, id }];
    await items.trash(ref);
    await items.purge(ref).catch(() => undefined);
    invalidations.itemsMutated(qc);
  };
}

export interface CaptureCtx {
  qc: QueryClient;
  navigate: Navigate;
  folderId: string | null;
  /** Display name of the destination (for the toast). */
  folderName?: string | null;
}

/** Text → Markdown note in the destination. Returns the file, or null on error. */
export async function captureText(ctx: CaptureCtx, raw: string): Promise<FileMeta | null> {
  const text = raw.trim();
  if (!text) return null;
  try {
    const created = await files.create({
      name: noteTitleFromText(text),
      folderId: ctx.folderId,
      kind: "notes",
    });
    const saved = await files.save(created.id, created.version, {
      kind: "notes",
      format: "markdown-v1",
      source: text,
    });
    invalidations.fileMutated(ctx.qc);
    pushRecentDestination(ctx.folderId);
    const undoId = pushUndo({
      label: `Captured "${saved.name}"`,
      undo: undoCreate(ctx.qc, saved.id),
    });
    toast.success(`Saved to ${destinationLabel(ctx.folderName)}`, {
      description: saved.name,
      action: { label: "Open", onClick: () => ctx.navigate(`/f/${saved.id}`) },
      cancel: { label: "Undo", onClick: () => void runUndo(undoId) },
    });
    return saved;
  } catch (e) {
    toast.error(errorMessage(e, "Could not save your capture"));
    return null;
  }
}

/** Blank note / board / diagram with a default name; opens it straight away. */
export async function createBlank(ctx: CaptureCtx, kind: CaptureKind): Promise<FileMeta | null> {
  try {
    const m = await files.create({
      name: defaultCaptureName(kind),
      folderId: ctx.folderId,
      kind,
    });
    invalidations.fileMutated(ctx.qc);
    pushRecentDestination(ctx.folderId);
    ctx.navigate(`/f/${m.id}`);
    return m;
  } catch (e) {
    toast.error(errorMessage(e, "Could not create file"));
    return null;
  }
}
