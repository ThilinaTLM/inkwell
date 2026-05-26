// UploadPanel — rough.js outlined dropzone with three explicit upload
// buttons. Lives next to (or below) the SiteCard so the primary
// mutation surface stays reachable without scrolling past the file
// list.
//
// Owns:
//   - dragOver state
//   - drop handler (with folder-aware FileSystem-Entry traversal)
//   - three hidden `<input>` pickers (zip / folder / files)
//   - the routing decision: a single dropped ZIP is treated as a
//     "replace all", everything else merges
//
// Receives the two mutations (files / zip) plus the bundle id from
// the parent so the editor stays the single source of truth for
// version mirroring and `If-Match` semantics.

import { FileUploadIcon, FolderUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useRef, useState } from "react";
import { RoughBox } from "@/components/rough/RoughBox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type UploadEntry = File | { path: string; file: File };

export interface UploadPanelProps {
  id: string;
  isEmpty: boolean;
  filesPending: boolean;
  zipPending: boolean;
  onUploadFiles: (entries: UploadEntry[]) => void;
  onUploadZip: (zip: Blob) => void;
}

export function UploadPanel({
  id,
  isEmpty,
  filesPending,
  zipPending,
  onUploadFiles,
  onUploadZip,
}: UploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);

  const [dragOver, setDragOver] = useState(false);

  const onPickFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const entries: UploadEntry[] = [];
    for (const f of Array.from(list)) {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
      if (rel && rel.length > 0) {
        const stripped = rel.split("/").slice(1).join("/") || f.name;
        entries.push({ path: stripped, file: f });
      } else {
        entries.push(f);
      }
    }
    onUploadFiles(entries);
  };

  const onPickZip = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onUploadZip(list[0]);
  };

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      setDragOver(false);
      const dt = e.dataTransfer;
      if (!dt) return;
      const items = dt.items;
      const collected: UploadEntry[] = [];
      if (items && items.length > 0 && (items[0] as DataTransferItem).webkitGetAsEntry) {
        const tasks: Promise<void>[] = [];
        for (let i = 0; i < items.length; i++) {
          const entry = (items[i] as DataTransferItem).webkitGetAsEntry?.();
          if (entry) tasks.push(walkEntry(entry, "", collected));
        }
        await Promise.all(tasks);
      } else {
        for (const f of Array.from(dt.files)) collected.push(f);
      }
      if (collected.length === 0) return;
      if (
        collected.length === 1 &&
        collected[0] instanceof File &&
        /\.zip$/i.test(collected[0].name)
      ) {
        onUploadZip(collected[0]);
        return;
      }
      onUploadFiles(collected);
    },
    [onUploadFiles, onUploadZip],
  );

  return (
    <section
      aria-label="Upload files"
      className={cn(
        "relative isolate rounded-md p-5 transition-shadow sm:p-6",
        dragOver && "ring-2 ring-primary/40",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <RoughBox
        shape="card"
        seed={`upload:${id}`}
        stroke={dragOver ? "var(--color-primary)" : "var(--color-card-stroke)"}
        strokeWidth={1.3}
        fill={dragOver ? "var(--color-accent)" : "var(--color-card)"}
        fillStyle="solid"
        roughness={1.2}
        bowing={0.9}
        radius={10}
      />
      <div
        aria-hidden
        className="bg-paper-grain pointer-events-none absolute inset-0 -z-0 rounded-md"
      />

      <div className="relative flex flex-col gap-4">
        <header className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-sm font-semibold">Upload</h2>
          <span
            className={cn(
              "font-hand text-base leading-none transition-colors",
              dragOver ? "text-primary" : "text-muted-foreground/85",
            )}
          >
            {dragOver ? "drop it!" : "drag a .zip, folder, or files here"}
          </span>
        </header>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => zipInputRef.current?.click()}
            disabled={zipPending}
          >
            <HugeiconsIcon icon={FolderUploadIcon} />
            Upload .zip {isEmpty ? null : "(replace all)"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => folderInputRef.current?.click()}
            disabled={filesPending}
          >
            <HugeiconsIcon icon={FolderUploadIcon} />
            Upload folder
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={filesPending}
          >
            <HugeiconsIcon icon={FileUploadIcon} />
            Upload files
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Uploading a <code className="font-mono">.zip</code> replaces the entire bundle. Uploading
          individual files or a folder merges into the existing bundle.
        </p>

        {/* Hidden inputs driven by the buttons above. */}
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
          // `webkitdirectory` is non-standard; React forwards it as an HTML
          // attribute regardless. Cast the prop bag so the TS DOM types
          // don't reject it.
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
            onPickZip(e.currentTarget.files);
            e.currentTarget.value = "";
          }}
        />
      </div>
    </section>
  );
}

// ─── Drag-and-drop folder walker ────────────────────────────────────
//
// FileSystem Entry API is non-standard but is the only DOM API that
// preserves directory structure on drop. Chromium, WebKit and Gecko
// all support it. We collect each leaf into a `{path, file}` pair so
// the upload reaches the worker with the right asset relpath.

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => {
    readEntries: (cb: (entries: FsEntry[]) => void, err?: (e: unknown) => void) => void;
  };
};

async function walkEntry(entry: unknown, prefix: string, out: UploadEntry[]): Promise<void> {
  if (!entry) return;
  const e = entry as FsEntry;
  if (e.isFile && e.file) {
    await new Promise<void>((resolve) => {
      e.file?.(
        (f) => {
          out.push({ path: prefix ? `${prefix}/${e.name}` : e.name, file: f });
          resolve();
        },
        () => resolve(),
      );
    });
    return;
  }
  if (e.isDirectory && e.createReader) {
    const reader = e.createReader();
    const children: FsEntry[] = [];
    await new Promise<void>((resolve) => {
      const drain = () =>
        reader.readEntries((batch) => {
          if (batch.length === 0) {
            resolve();
            return;
          }
          children.push(...batch);
          drain();
        });
      drain();
    });
    const next = prefix ? `${prefix}/${e.name}` : e.name;
    await Promise.all(children.map((c) => walkEntry(c, next, out)));
  }
}
