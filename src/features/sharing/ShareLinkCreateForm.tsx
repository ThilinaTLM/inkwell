// "Create new link" form — extracted from ShareDialog.
//
// Self-contained: owns its own form state and resets it on every
// successful create. The parent decides where to mount it (expanded
// inline when there are zero existing links, or behind a `+ New link`
// toggle when there are some).
//
// Field UI lives in `./fields/*` so the create and edit forms render
// the same controls.

import { Link01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Share, SharePermission } from "@/lib/api/client";
import { AllowDownloadField } from "./fields/AllowDownloadField";
import { ExpiryChips, type ExpiryOption } from "./fields/ExpiryChips";
import { LabelField } from "./fields/LabelField";
import { PermissionSegment } from "./fields/PermissionSegment";

interface CreateBody {
  permission: SharePermission;
  allowDownload: boolean;
  expiresAt: number | null;
  label: string | null;
}

// Each preset id maps to a relative offset in ms. `null` means "no
// expiry"; the resolved `expiresAt` is computed at submit time so the
// timestamp is fresh even if the form sat open for a while.
const EXPIRY_PRESETS: { id: string; label: string; ms: number | null }[] = [
  { id: "never", label: "Never", ms: null },
  { id: "1d", label: "1 day", ms: 24 * 60 * 60 * 1000 },
  { id: "7d", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];
const EXPIRY_OPTIONS: ExpiryOption[] = EXPIRY_PRESETS.map(({ id, label }) => ({ id, label }));
const DEFAULT_EXPIRY_ID = "1d";

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
  const [expiryId, setExpiryId] = useState<string>(DEFAULT_EXPIRY_ID);
  const [label, setLabel] = useState("");

  // Reset every time the parent bumps `resetSignal`. The signal value
  // itself is unused inside the body — it's a dependency-only trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger-only dep
  useEffect(() => {
    setPerm("read");
    setAllowDownload(true);
    setExpiryId(DEFAULT_EXPIRY_ID);
    setLabel("");
  }, [resetSignal]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const preset = EXPIRY_PRESETS.find((p) => p.id === expiryId) ?? EXPIRY_PRESETS[0];
    const body: CreateBody = {
      permission: perm,
      allowDownload: perm === "write" ? true : allowDownload,
      expiresAt: preset.ms === null ? null : Date.now() + preset.ms,
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
      <PermissionSegment value={perm} onChange={setPerm} />
      <AllowDownloadField permission={perm} value={allowDownload} onChange={setAllowDownload} />
      <ExpiryChips
        options={EXPIRY_OPTIONS}
        value={expiryId}
        onChange={setExpiryId}
        smGridCols="sm:grid-cols-4"
      />
      <LabelField value={label} onChange={setLabel} />

      <Button type="submit" disabled={pending}>
        <HugeiconsIcon icon={Link01Icon} strokeWidth={2} />
        {pending ? "Creating…" : "Create link"}
      </Button>
    </form>
  );
}
