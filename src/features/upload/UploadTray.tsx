// Screen 07 upload tray: fixed bottom-right panel with one row per job.
// Mounted once by the shell; renders into a portal and only shows when
// open and non-empty. Reopened from the TopBar via `toggleUploadTray`.

import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  CloudUploadIcon,
  FileBlockIcon,
  Loading03Icon,
  RefreshIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { FileKindGlyph } from "@/components/icons/file-kind-icons";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  bindQueryClient,
  cancelAll,
  cancelJob,
  dismissTray,
  isActiveStage,
  resolveConflict,
  retryAllFailed,
  retryJob,
  setTrayCollapsed,
  type UploadJob,
  uploadStore,
} from "./queue";
import type { ConflictChoice } from "./types";

const STAGE_LABEL: Record<UploadJob["stage"], string> = {
  queued: "Queued",
  creating: "Creating",
  writing: "Uploading",
  thumbnail: "Thumbnail",
  done: "Done",
  error: "Failed",
  skipped: "Skipped",
  conflict: "Name already exists",
};

export function UploadTray() {
  const qc = useQueryClient();
  useEffect(() => bindQueryClient(qc), [qc]);

  const state = useStore(uploadStore);
  if (!state.open || state.jobs.length === 0 || typeof document === "undefined") return null;

  const jobs = state.jobs;
  const total = jobs.length;
  const active = jobs.filter((j) => isActiveStage(j.stage)).length;
  const settled = total - active;
  const done = jobs.filter((j) => j.stage === "done").length;
  const failed = jobs.filter((j) => j.stage === "error").length;
  const conflicts = jobs.filter((j) => j.stage === "conflict").length;
  const hasNotes = jobs.some((j) => j.kind === "notes" && !j.unsupported);

  const title =
    conflicts > 0 && active === conflicts
      ? `${conflicts} conflict${conflicts === 1 ? "" : "s"} to resolve`
      : active > 0
        ? `Uploading ${Math.min(settled + 1, total)} of ${total}`
        : `${done} of ${total} uploaded`;

  return createPortal(
    <section
      aria-label="Uploads"
      className={cn(
        "fixed right-4 bottom-4 z-50 flex max-h-[min(28rem,70vh)] w-[min(360px,calc(100vw-2rem))] flex-col",
        "overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-150",
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <HugeiconsIcon
          icon={active > conflicts ? Loading03Icon : CloudUploadIcon}
          strokeWidth={1.8}
          className={cn("size-4 shrink-0", active > conflicts && "animate-spin")}
        />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" aria-live="polite">
          {title}
          {failed > 0 ? <span className="ml-1.5 text-destructive">· {failed} failed</span> : null}
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={state.collapsed ? "Expand uploads" : "Collapse uploads"}
          aria-expanded={!state.collapsed}
          onClick={() => setTrayCollapsed(!state.collapsed)}
        >
          <HugeiconsIcon icon={state.collapsed ? ArrowUp01Icon : ArrowDown01Icon} />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={active > 0 ? "Hide uploads (keeps running)" : "Close uploads"}
          title={active > 0 ? "Hide (uploads keep running)" : "Close"}
          onClick={dismissTray}
        >
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </header>

      {state.collapsed ? null : (
        <>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {jobs.map((job) => (
              <UploadRow key={job.id} job={job} />
            ))}
          </ul>
          {conflicts > 0 ? (
            <ApplyToAll />
          ) : failed > 1 || (active > 1 && failed === 0) || hasNotes ? (
            <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-2 text-[11.5px] text-muted-foreground">
              {hasNotes ? (
                <span className="min-w-0 flex-1">
                  Markdown becomes Notes blocks; unsupported syntax turns into plain text.
                </span>
              ) : (
                <span className="flex-1" />
              )}
              {failed > 1 ? (
                <button
                  type="button"
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                  onClick={retryAllFailed}
                >
                  Retry failed
                </button>
              ) : null}
              {active > 1 ? (
                <button
                  type="button"
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                  onClick={cancelAll}
                >
                  Cancel all
                </button>
              ) : null}
            </footer>
          ) : null}
        </>
      )}
    </section>,
    document.body,
  );
}

function ApplyToAll() {
  const choose = (c: ConflictChoice) => resolveConflict("", c, true);
  return (
    <footer className="border-t border-border px-3 py-2 text-[11.5px] text-muted-foreground">
      Apply to all conflicts: <LinkButton onClick={() => choose("keepBoth")}>Keep both</LinkButton>{" "}
      · <LinkButton onClick={() => choose("replace")}>Replace</LinkButton> ·{" "}
      <LinkButton onClick={() => choose("skip")}>Skip</LinkButton>
    </footer>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-medium text-accent-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

function UploadRow({ job }: { job: UploadJob }) {
  const running = job.stage === "creating" || job.stage === "writing" || job.stage === "thumbnail";
  const isConflict = job.stage === "conflict";

  if (job.unsupported) {
    return (
      <li className="flex items-center gap-2.5 border-b border-border/40 px-3 py-2 text-xs text-muted-foreground last:border-b-0">
        <HugeiconsIcon icon={FileBlockIcon} strokeWidth={1.8} className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate" title={`${job.label} — ${job.message ?? ""}`}>
          {job.label} — {job.message ?? "unsupported type"}
        </span>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "flex items-center gap-2.5 border-b border-border/40 px-3 py-2 text-xs last:border-b-0",
        isConflict && "bg-amber-400/10",
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        {job.kind ? <FileKindGlyph kind={job.kind} className="size-4" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-foreground" title={job.label}>
            {job.label}
          </span>
          {job.detail ? (
            <span className="shrink-0 truncate text-muted-foreground">({job.detail})</span>
          ) : null}
        </div>
        {isConflict ? (
          <div className="text-[11px] text-amber-700 dark:text-amber-300">
            Name already exists{job.conflict?.canReplace ? "" : " (can't replace — different kind)"}
          </div>
        ) : job.stage === "error" ? (
          <div className="truncate text-[11px] text-destructive" title={job.message}>
            {job.message ?? "Upload failed"}
          </div>
        ) : job.stage === "skipped" || (job.stage === "done" && job.message) ? (
          <div className="truncate text-[11px] text-muted-foreground" title={job.message}>
            {job.message}
          </div>
        ) : (
          <div
            className="mt-1 h-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`${job.label}: ${STAGE_LABEL[job.stage]}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(job.progress * 100)}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300",
                job.stage === "done" ? "bg-emerald-500" : "bg-primary",
              )}
              style={{ width: `${Math.max(job.progress * 100, running ? 8 : 0)}%` }}
            />
          </div>
        )}
      </div>

      {isConflict ? (
        <div className="flex shrink-0 gap-1">
          <Button size="xs" variant="outline" onClick={() => resolveConflict(job.id, "keepBoth")}>
            Keep both
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={!job.conflict?.canReplace}
            onClick={() => resolveConflict(job.id, "replace")}
          >
            Replace
          </Button>
          <Button size="xs" variant="ghost" onClick={() => resolveConflict(job.id, "skip")}>
            Skip
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          {job.stage === "done" ? (
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2.2}
              className="size-3.5 text-emerald-600 dark:text-emerald-400"
              aria-label="Done"
            />
          ) : running ? (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {STAGE_LABEL[job.stage]}
            </span>
          ) : job.stage === "queued" ? (
            <span className="text-[11px] text-muted-foreground">Queued</span>
          ) : null}
          {job.stage === "error" ? (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Retry ${job.label}`}
              title="Retry"
              onClick={() => retryJob(job.id)}
            >
              <HugeiconsIcon icon={RefreshIcon} />
            </Button>
          ) : null}
          {job.cancellable && (job.stage === "queued" || running || job.stage === "error") ? (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Cancel ${job.label}`}
              title="Cancel"
              onClick={() => cancelJob(job.id)}
            >
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          ) : null}
        </div>
      )}
    </li>
  );
}
