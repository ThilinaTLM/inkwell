// SiteCard — the identity panel of the static-site edit page.
//
// Carries the bundle's identity (entry filename, file count, total
// size) and the primary "Open site in new tab" action. Individual
// assets live in the file list next to it; the entry is signalled
// there with a stripe + badge rather than a duplicated filename.

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
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
    >
      <header className="flex items-center justify-between gap-2">
        <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground/70">
          Entry page
        </span>
        <span className="inline-flex items-center rounded-full bg-kind-static/10 px-2 py-0.5 text-[0.625rem] font-medium text-kind-static">
          Static site
        </span>
      </header>

      <div className="min-w-0">
        {isEmpty ? (
          <span className="font-mono text-sm text-muted-foreground">No entry set yet</span>
        ) : (
          <span className="block break-all font-mono text-base font-medium leading-snug text-foreground">
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

      <div>
        <Button
          onClick={onOpen}
          disabled={isEmpty || openPending}
          aria-label="Open rendered site in a new tab"
          title={isEmpty ? "Upload files to enable preview" : "Open the rendered site in a new tab"}
        >
          <HugeiconsIcon icon={LinkSquare01Icon} />
          Open site in new tab
        </Button>
      </div>
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}
