// SiteCard — the manila "label slip" that anchors the static-site
// edit page. It carries the bundle's identity: entry filename, file
// count, total size, and the primary "Open in new tab" CTA.
//
// Replaces the redundant ENTRY PAGE summary card in the original
// design. The same information lives in two places no more — the
// site card carries identity, the file list carries individual file
// rows (the entry is signalled there with a ribbon + stripe, not a
// duplicate filename).
//
// Visual: rough.js outlined card with `--folder-soft` fill so it
// reads as a manila slip pinned to the desk, paper-grain overlay for
// tooth, slight per-id tilt to feel hand-laid.

import { LinkSquare01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { RoughBox } from "@/components/rough/RoughBox";
import { tiltFromId } from "@/components/sketch/tilt";
import { Button } from "@/components/ui/button";

export interface SiteCardProps {
  id: string;
  entry: string;
  isEmpty: boolean;
  fileCount: number;
  totalLabel: string;
  onOpen: () => void;
  openPending: boolean;
}

export function SiteCard({
  id,
  entry,
  isEmpty,
  fileCount,
  totalLabel,
  onOpen,
  openPending,
}: SiteCardProps) {
  const tilt = tiltFromId(`site-card:${id}`, 0.4);
  const fileNoun = fileCount === 1 ? "file" : "files";

  return (
    <section
      aria-label="Site overview"
      className="relative isolate"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <RoughBox
        shape="card"
        seed={`site-card:${id}`}
        stroke="var(--color-card-stroke)"
        strokeWidth={1.3}
        fill="var(--color-folder-soft)"
        fillStyle="solid"
        roughness={0.9}
        bowing={0.6}
        radius={10}
      />
      <div
        aria-hidden
        className="bg-paper-grain pointer-events-none absolute inset-0 -z-0 rounded-md"
      />

      <div className="relative flex flex-col gap-4 p-5 sm:p-6">
        <header className="flex items-center justify-between gap-2">
          <span className="font-hand text-lg leading-none text-foreground/75">entry&nbsp;→</span>
          <span className="inline-flex items-center rounded-full bg-card/70 px-2 py-0.5 font-sans text-[10px] uppercase tracking-[0.12em] text-muted-foreground ring-1 ring-border/40">
            static site
          </span>
        </header>

        <div className="min-w-0">
          {isEmpty ? (
            <span className="font-mono text-base italic text-muted-foreground">
              no entry set yet
            </span>
          ) : (
            <span className="block font-mono text-lg font-semibold leading-snug text-foreground break-all">
              {entry}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip>
            {fileCount} {fileNoun}
          </Chip>
          <Chip>{totalLabel}</Chip>
        </div>

        <div className="pt-1">
          <Button
            variant="default"
            size="lg"
            onClick={onOpen}
            disabled={isEmpty || openPending}
            aria-label="Open rendered site in a new tab"
            title={
              isEmpty ? "Upload files to enable preview" : "Open the rendered site in a new tab"
            }
          >
            <HugeiconsIcon icon={LinkSquare01Icon} />
            Open site in new tab
          </Button>
        </div>
      </div>
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-card/70 px-2.5 py-1 font-sans text-xs text-foreground ring-1 ring-border/40">
      {children}
    </span>
  );
}
