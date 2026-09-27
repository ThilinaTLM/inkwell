// Allow-downloads switch. Edit links always allow downloads (the worker
// enforces this too), so the switch shows on + disabled for "write".

import { Toggle } from "@/features/settings/controls";
import type { SharePermission } from "@/lib/api/client";

export function AllowDownloadField({
  permission,
  value,
  onChange,
  id,
}: {
  permission: SharePermission;
  value: boolean;
  onChange: (next: boolean) => void;
  id?: string;
}) {
  const isWrite = permission === "write";
  return (
    <Toggle
      id={id}
      label="Allow downloads"
      checked={isWrite ? true : value}
      disabled={isWrite}
      title={isWrite ? "Edit links always allow downloads" : undefined}
      onChange={onChange}
    />
  );
}
