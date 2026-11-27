// FilesList — the bundle table. Same card + hairline-row treatment as
// the library list; delete goes through a confirmation.

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { StaticSiteFileBlob } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { FILE_GRID, FileRow } from "./FileRow";
import { formatBytes } from "./sitePaths";

export interface FilesListProps {
  manifest: StaticSiteFileBlob;
  writable: boolean;
  busy: boolean;
  /** `(path) => url` for downloads, or null before a session exists. */
  fileUrl: ((path: string) => string) | null;
  onOpen: (path: string) => void;
  onSetEntry: (path: string) => void;
  onDelete: (path: string) => void;
}

export function FilesList({
  manifest,
  writable,
  busy,
  fileUrl,
  onOpen,
  onSetEntry,
  onDelete,
}: FilesListProps) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const total = manifest.assets.reduce((a, b) => a + b.size, 0);

  return (
    <section aria-label="Files in the bundle">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-sm font-medium text-foreground">Files in this site</h2>
        <span className="text-xs text-muted-foreground">
          {manifest.assets.length} {manifest.assets.length === 1 ? "file" : "files"} ·{" "}
          {formatBytes(total)}
        </span>
      </div>
      <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-card">
        <div
          className={cn(
            FILE_GRID,
            "hidden border-b border-border/60 bg-muted/30 px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:grid",
          )}
        >
          <span>Name</span>
          <span>Type</span>
          <span>Size</span>
          <span>Modified</span>
          <span className="sr-only">Actions</span>
        </div>
        <ul>
          {manifest.assets.map((a) => (
            <FileRow
              key={a.path}
              asset={a}
              isEntry={a.path === manifest.entry}
              writable={writable}
              busy={busy}
              href={fileUrl ? fileUrl(a.path) : null}
              onOpen={onOpen}
              onSetEntry={onSetEntry}
              onDelete={setPendingDelete}
            />
          ))}
        </ul>
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              <code className="font-mono text-foreground">{pendingDelete}</code> will be removed
              from the site. Pages that link to it may break.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
