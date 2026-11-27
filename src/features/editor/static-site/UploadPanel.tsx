// UploadPanel — the drop zone for a static site.
//
// Two explicit intents instead of three mismatched buttons:
//   · Add     files / a folder are MERGED into the bundle (safe).
//   · Replace a .zip swaps the whole bundle (destructive → confirmed
//             unless the site is still empty).
// A single dropped .zip is always treated as "replace". The server
// request has no byte-level progress, so pending shows an indeterminate
// bar with what is being sent.

import {
  CloudUploadIcon,
  FileUploadIcon,
  FolderUploadIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { collectDrop } from "@/features/upload/collectDrop";
import { cn } from "@/lib/utils";
import { formatBytes } from "./sitePaths";

export type UploadEntry = File | { path: string; file: File };

export interface UploadPanelProps {
  isEmpty: boolean;
  /** Something is being uploaded right now. */
  pending: { kind: "files" | "zip"; label: string } | null;
  onUploadFiles: (entries: UploadEntry[]) => void;
  onUploadZip: (zip: Blob) => void;
  /** First-run only: create a starter index.html. */
  onUseTemplate?: () => void;
  className?: string;
}

export function UploadPanel({
  isEmpty,
  pending,
  onUploadFiles,
  onUploadZip,
  onUseTemplate,
  className,
}: UploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmZip, setConfirmZip] = useState<File | null>(null);
  const busy = pending !== null;

  const requestZip = useCallback(
    (zip: File) => {
      if (isEmpty) onUploadZip(zip);
      else setConfirmZip(zip);
    },
    [isEmpty, onUploadZip],
  );

  const onPickFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const entries: UploadEntry[] = [];
    for (const f of Array.from(list)) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
      if (rel && rel.length > 0) {
        entries.push({ path: rel.split("/").slice(1).join("/") || f.name, file: f });
      } else {
        entries.push(f);
      }
    }
    onUploadFiles(entries);
  };

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (busy || !e.dataTransfer) return;
      const collected: UploadEntry[] = (await collectDrop(e.dataTransfer)).map((d) =>
        d.relativePath === d.file.name ? d.file : { path: d.relativePath, file: d.file },
      );
      if (collected.length === 0) return;
      const only = collected[0];
      if (collected.length === 1 && only instanceof File && /\.zip$/i.test(only.name)) {
        requestZip(only);
        return;
      }
      onUploadFiles(collected);
    },
    [busy, onUploadFiles, requestZip],
  );

  return (
    <section
      aria-label="Upload to this site"
      data-drag={dragOver}
      data-testid="site-upload"
      className={cn(
        "relative overflow-hidden rounded-[14px] border border-dashed border-border bg-card/60 transition-colors",
        "data-[drag=true]:border-primary data-[drag=true]:bg-accent-soft/50",
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <div
        className={cn(
          "flex flex-col items-center gap-4 px-5 text-center",
          isEmpty ? "py-12 sm:py-16" : "py-7",
        )}
      >
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-2xl bg-accent-soft text-accent-text",
            isEmpty ? "size-14" : "size-10",
          )}
        >
          <HugeiconsIcon
            icon={busy ? Loading03Icon : CloudUploadIcon}
            strokeWidth={1.6}
            className={cn(isEmpty ? "size-7" : "size-5", busy && "animate-spin")}
          />
        </span>

        <div className="max-w-md">
          <h2
            className={cn(
              "font-display font-medium text-foreground",
              isEmpty ? "text-xl" : "text-base",
            )}
          >
            {busy
              ? pending.label
              : dragOver
                ? "Drop to upload"
                : isEmpty
                  ? "Publish your first page"
                  : "Add to this site"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEmpty
              ? "Drop a .zip, a folder, or an .html file here. The first HTML page becomes the entry."
              : "Drop files or a folder to merge them in. Files with the same path are overwritten."}
          </p>
        </div>

        {busy ? (
          <div
            role="progressbar"
            aria-label="Uploading"
            className="h-1 w-56 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full w-full animate-pulse rounded-full bg-primary" />
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              <HugeiconsIcon icon={FileUploadIcon} strokeWidth={1.8} />
              Add files
            </Button>
            <Button variant="outline" size="sm" onClick={() => folderInputRef.current?.click()}>
              <HugeiconsIcon icon={FolderUploadIcon} strokeWidth={1.8} />
              Add folder
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => zipInputRef.current?.click()}
              data-testid="site-upload-zip"
            >
              {isEmpty ? "Upload .zip" : "Replace with .zip…"}
            </Button>
          </div>
        )}

        {isEmpty && !busy && onUseTemplate ? (
          <button
            type="button"
            onClick={onUseTemplate}
            data-testid="site-use-template"
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            or start from a blank index.html
          </button>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onPickFiles(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        {...({ webkitdirectory: "" } as Record<string, string>)}
        onChange={(e) => {
          onPickFiles(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) requestZip(f);
          e.currentTarget.value = "";
        }}
      />

      <AlertDialog open={confirmZip !== null} onOpenChange={(o) => !o && setConfirmZip(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the whole site?</AlertDialogTitle>
            <AlertDialogDescription>
              Every file currently in this site will be removed and replaced by the contents of{" "}
              <span className="font-medium text-foreground">{confirmZip?.name}</span>
              {confirmZip ? ` (${formatBytes(confirmZip.size)})` : null}. This can’t be undone. To
              keep existing files, add files or a folder instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              data-testid="site-replace-confirm"
              onClick={() => {
                if (confirmZip) onUploadZip(confirmZip);
                setConfirmZip(null);
              }}
            >
              Replace everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
