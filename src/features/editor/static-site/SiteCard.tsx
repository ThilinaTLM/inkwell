// SiteCard — the bundle summary at the top of the "manage" view:
// entry page (changeable), file count / size and open-site action.

import { Home01Icon, LinkSquare01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StaticSiteFileBlob } from "@/lib/api/client";
import { formatBytes, isHtmlPath } from "./sitePaths";

export interface SiteCardProps {
  manifest: StaticSiteFileBlob;
  writable: boolean;
  busy: boolean;
  onOpen: () => void;
  openPending: boolean;
  onSetEntry: (path: string) => void;
}

export function SiteCard({
  manifest,
  writable,
  busy,
  onOpen,
  openPending,
  onSetEntry,
}: SiteCardProps) {
  const total = manifest.assets.reduce((a, b) => a + b.size, 0);
  const pages = manifest.assets.filter((a) => isHtmlPath(a.path));
  const canChange = writable && pages.length > 1;

  return (
    <section
      aria-label="Site summary"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[14px] border border-border bg-card px-4 py-3.5 shadow-card sm:px-5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent-text">
          <HugeiconsIcon icon={Home01Icon} strokeWidth={1.8} className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Entry page
          </p>
          <p className="truncate font-mono text-sm text-foreground" data-testid="site-entry">
            {manifest.entry}
          </p>
        </div>
      </div>

      <dl className="flex items-center gap-6 text-sm">
        <div>
          <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Files
          </dt>
          <dd className="tabular-nums">{manifest.assets.length}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Size
          </dt>
          <dd className="tabular-nums">{formatBytes(total)}</dd>
        </div>
      </dl>

      <div className="flex items-center gap-2">
        {canChange ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" disabled={busy}>
                  Change entry
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-auto min-w-52">
              <DropdownMenuRadioGroup value={manifest.entry} onValueChange={onSetEntry}>
                {pages.map((p) => (
                  <DropdownMenuRadioItem key={p.path} value={p.path}>
                    <span className="font-mono text-xs">{p.path}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Button variant="outline" size="sm" onClick={onOpen} disabled={openPending}>
          <HugeiconsIcon icon={LinkSquare01Icon} strokeWidth={1.8} />
          Open site
        </Button>
      </div>
    </section>
  );
}
