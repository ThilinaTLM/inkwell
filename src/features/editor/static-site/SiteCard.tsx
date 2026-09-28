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
// Visual: a clean rounded card with a soft manila (`--folder-soft`)
// fill and a hairline border.

import { LinkSquare01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";

export interface SiteCardProps {
  entry: string;
  isEmpty: boolean;
  fileCount: number;
  totalLabel: string;
  onOpen: () => void;
  openPending: boolean;
}

export function SiteCard({
  entry,
  isEmpty,
  fileCount,
  totalLabel,
  onOpen,
  openPending,
}: SiteCardProps) {
  const fileNoun = fileCount === 1 ? "file" : "files";

  return (
    <section
      aria-label="Site overview"
      className="relative rounded-xl border border-border bg-folder-soft"
    >
      <div className="relative flex flex-col gap-4 p-5 sm:p-6">
        <header className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Entry&nbsp;→</span>
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
