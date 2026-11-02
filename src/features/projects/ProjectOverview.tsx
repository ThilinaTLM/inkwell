// Collapsible, read-only excerpt of a project's "Overview" (or README) note.

import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { itemActions } from "@/features/actions/useItemActions";
import type { FileMeta } from "@/lib/api/client";
import { files } from "@/lib/api/client";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Markdown rendering pulls in katex/mermaid/highlight — load on demand.
const MarkdownPreview = lazy(() =>
  import("@/features/editor/markdown/MarkdownPreview").then((m) => ({
    default: m.MarkdownPreview,
  })),
);

const OVERVIEW_NAME = /^(overview|readme)(\.md)?$/i;

/** The project's Overview / README note, if it has one. */
export function findOverviewNote(list: readonly FileMeta[]): FileMeta | undefined {
  return list.find((f) => f.kind === "notes" && OVERVIEW_NAME.test(f.name.trim()));
}

export function ProjectOverview({ note }: { note: FileMeta }) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { resolved } = useTheme();
  const q = useQuery({
    queryKey: ["project", "overview", note.id, note.updatedAt],
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const loaded = await files.load(note.id);
      const blob = loaded.blob;
      return blob.kind === "notes" && "source" in blob ? blob.source : "";
    },
  });
  const source = q.data?.trim() ?? "";

  // Offer "Show more" only when the clipped excerpt actually hides content.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the content or visibility changes
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || expanded) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 4);
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [expanded, source, open]);

  return (
    <section
      aria-label="Overview"
      className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-card"
    >
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded text-[11px] font-semibold tracking-[0.09em] text-faint uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className={cn("size-3.5 transition-transform", !open && "-rotate-90")}
          />
          Overview
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 text-[13px]"
          onClick={() => itemActions.open({ type: "file", id: note.id })}
        >
          Open
        </Button>
      </div>
      {open ? (
        <div className="relative border-t border-border px-5 pt-3 pb-4">
          {q.isPending ? (
            <div aria-hidden className="h-16 animate-pulse rounded-md bg-surface-2" />
          ) : source ? (
            <>
              <div
                ref={bodyRef}
                className={cn(
                  "overflow-hidden [&_.markdown-preview]:text-[13.5px]! [&_.markdown-preview]:leading-6! [&_.markdown-preview_h1]:text-[1.35em]! [&_.markdown-preview_h2]:text-[1.15em]! [&_.markdown-preview_h3]:text-[1.05em]",
                  !expanded && "max-h-32",
                  !expanded &&
                    overflowing &&
                    "[mask-image:linear-gradient(to_bottom,black_60%,transparent)]",
                )}
              >
                <Suspense fallback={<div className="h-16" />}>
                  <MarkdownPreview
                    source={source}
                    dark={resolved === "dark"}
                    fontFamily="inherit"
                  />
                </Suspense>
              </div>
              {overflowing || expanded ? (
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  className="mt-1 rounded text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  {expanded ? "Show less" : "Show more"}
                </button>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This note is empty. Open it to describe the project.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
