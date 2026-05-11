// Allow-download checkbox for a share form.
//
// Write shares always allow download (the worker enforces this on the
// server side too); the checkbox is visually checked + disabled in that
// case so the user can see why the toggle is unavailable. The parent
// still owns the local `allowDownload` state and is expected to coerce
// to `true` when permission is "write" before sending to the API.

import { useId } from "react";
import type { SharePermission } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export function AllowDownloadField({
  permission,
  value,
  onChange,
}: {
  permission: SharePermission;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  const isWrite = permission === "write";
  return (
    <label
      htmlFor={id}
      className={cn("flex items-center gap-2 text-sm", isWrite && "text-muted-foreground")}
    >
      <input
        id={id}
        type="checkbox"
        className="size-4"
        checked={isWrite ? true : value}
        disabled={isWrite}
        onChange={(e) => onChange(e.target.checked)}
      />
      Allow download
    </label>
  );
}
