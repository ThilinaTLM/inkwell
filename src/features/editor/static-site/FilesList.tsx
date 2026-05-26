// FilesList — paper-sheet panel listing every asset in a static-site
// bundle. Wrapped in a rough.js silhouette so the panel reads as a
// torn-from-the-pad sheet, then overlaid with paper-grain + fibre
// dots for tooth.
//
// Pure presentation — receives a manifest and a handful of callbacks.
// Sorts so the entry row appears first (this addresses a real
// scannability problem: today the entry can sit mid-list when the
// list is strictly alphabetical, so users hunt for it).

import { useMemo } from "react";
import { RoughBox } from "@/components/rough/RoughBox";
import { EmptyDeskNote } from "@/components/sketch/EmptyDeskNote";
import type { StaticSiteFileBlob } from "@/lib/api/client";
import { FileRow } from "./FileRow";

export interface FilesListProps {
  id: string;
  manifest: StaticSiteFileBlob;
  totalLabel: string;
  writable: boolean;
  busy: boolean;
  onSetEntry: (path: string) => void;
  onDelete: (path: string) => void;
}

export function FilesList({
  id,
  manifest,
  totalLabel,
  writable,
  busy,
  onSetEntry,
  onDelete,
}: FilesListProps) {
  const assets = manifest.assets;
  const entry = manifest.entry;
  const isEmpty = assets.length === 0;

  // Entry-first, then alphabetical. The server already returns
  // assets sorted alphabetically, so we just hoist the entry. This
  // also means a paths-equal-to-entry-string fallback returns the
  // first row, which is the same row we'd hoist; idempotent.
  const sorted = useMemo(() => {
    if (assets.length === 0) return assets;
    const e = assets.find((a) => a.path === entry);
    if (!e) return assets;
    return [e, ...assets.filter((a) => a.path !== entry)];
  }, [assets, entry]);

  return (
    <section aria-label="Files in bundle" className="relative isolate">
      <RoughBox
        shape="card"
        seed={`files-card:${id}`}
        stroke="var(--color-card-stroke)"
        strokeWidth={1.3}
        fill="var(--color-card)"
        fillStyle="solid"
        roughness={0.7}
        bowing={0.5}
        radius={10}
      />
      {/* Paper tooth — grain + sparse fibre dots. `-z-0` keeps them
          above the rough.js silhouette but below the content. */}
      <div
        aria-hidden
        className="bg-paper-grain pointer-events-none absolute inset-0 -z-0 rounded-md"
      />
      <div
        aria-hidden
        className="bg-paper-dots pointer-events-none absolute inset-0 -z-0 rounded-md"
      />

      <header className="relative flex items-center justify-between gap-2 px-4 pt-3 pb-2 sm:px-5">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-sm font-semibold">Files</h2>
          <span className="font-hand text-base leading-none text-muted-foreground/80">
            inside the bundle
          </span>
        </div>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {totalLabel}
        </span>
      </header>

      <div aria-hidden className="relative mx-4 h-px bg-border/40 sm:mx-5" />

      {isEmpty ? (
        <div className="relative px-4 pb-6 sm:px-5">
          <EmptyDeskNote
            seed={`static-empty:${id}`}
            title="No pages yet"
            body={
              writable
                ? "Drop a .zip on the upload card to publish your first page."
                : "This bundle is empty."
            }
          />
        </div>
      ) : (
        <ul className="relative divide-y divide-border/30">
          {sorted.map((a) => (
            <FileRow
              key={a.path}
              path={a.path}
              size={formatBytes(a.size)}
              isEntry={a.path === entry}
              writable={writable}
              busy={busy}
              onSetEntry={() => onSetEntry(a.path)}
              onDelete={() => onDelete(a.path)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// Local copy of the byte formatter — kept here so `FilesList` is
// drop-in usable without importing from `StaticSiteEditor`.
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
