// "Create new link" form — extracted from ShareDialog.
//
// Self-contained: owns its own form state and resets it on every
// successful create. The parent decides where to mount it (expanded
// inline when there are zero existing links, or behind a `+ New link`
// toggle when there are some).

import { Link01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Share, SharePermission } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface CreateBody {
  permission: SharePermission;
  allowDownload: boolean;
  expiresAt: number | null;
  label: string | null;
}

const EXPIRY_OPTIONS: { id: string; label: string; ms: number | null }[] = [
  { id: "never", label: "Never", ms: null },
  { id: "1d", label: "1 day", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

export function ShareLinkCreateForm({
  pending,
  onCreate,
  resetSignal,
}: {
  pending: boolean;
  /** Called with the create body. The parent runs the mutation, copies
   *  the link to clipboard, surfaces the toast, and resolves with the
   *  fresh share so the form can reset. */
  onCreate: (body: CreateBody) => Promise<Share>;
  /** Bumping this number resets the form (e.g. when the dialog reopens
   *  with a different target). */
  resetSignal?: number;
}) {
  const [perm, setPerm] = useState<SharePermission>("read");
  const [allowDownload, setAllowDownload] = useState(true);
  const [expiryIdx, setExpiryIdx] = useState(1); // default 1 day
  const [label, setLabel] = useState("");
  const downloadId = useId();
  const labelId = useId();

  // Reset every time the parent bumps `resetSignal`. The signal value
  // itself is unused inside the body — it's a dependency-only trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger-only dep
  useEffect(() => {
    setPerm("read");
    setAllowDownload(true);
    setExpiryIdx(1);
    setLabel("");
  }, [resetSignal]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const expiresMs = EXPIRY_OPTIONS[expiryIdx].ms;
    const body: CreateBody = {
      permission: perm,
      allowDownload: perm === "write" ? true : allowDownload,
      expiresAt: expiresMs === null ? null : Date.now() + expiresMs,
      label: label.trim() || null,
    };
    try {
      await onCreate(body);
      // Reset only the label so the user can quickly mint another link
      // with the same defaults.
      setLabel("");
    } catch {
      // Parent surfaces the error toast.
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Permission */}
      <div className="grid grid-cols-2 gap-2">
        <PermSegment
          active={perm === "read"}
          onClick={() => setPerm("read")}
          title="View only"
          subtitle="Read-only access."
        />
        <PermSegment
          active={perm === "write"}
          onClick={() => setPerm("write")}
          title="Can edit"
          subtitle="Read-write access."
        />
      </div>

      {/* Allow download */}
      <label
        htmlFor={downloadId}
        className={cn(
          "flex items-center gap-2 text-sm",
          perm === "write" && "text-muted-foreground",
        )}
      >
        <input
          id={downloadId}
          type="checkbox"
          className="size-4"
          checked={perm === "write" ? true : allowDownload}
          disabled={perm === "write"}
          onChange={(e) => setAllowDownload(e.target.checked)}
        />
        Allow download (.excalidraw)
      </label>

      {/* Expiry */}
      <div className="flex flex-col gap-2">
        <Label>Expires</Label>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {EXPIRY_OPTIONS.map((opt, i) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setExpiryIdx(i)}
              data-active={expiryIdx === i}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs transition-colors data-[active=true]:border-ring data-[active=true]:bg-accent data-[active=true]:text-accent-foreground hover:bg-accent/40"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Label */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={labelId}>Label (optional)</Label>
        <Input
          id={labelId}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Q4 review"
          maxLength={200}
        />
      </div>

      <Button type="submit" disabled={pending}>
        <HugeiconsIcon icon={Link01Icon} strokeWidth={2} />
        {pending ? "Creating…" : "Create link"}
      </Button>
    </form>
  );
}

function PermSegment({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="rounded-md border border-border bg-background px-3 py-2.5 text-left transition-colors data-[active=true]:border-ring data-[active=true]:bg-accent data-[active=true]:text-accent-foreground hover:bg-accent/40"
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </button>
  );
}
