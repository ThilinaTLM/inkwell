// Expiry preset chips (1 h · 1 day · 7 days · 30 days · Never) with an
// optional "Custom…" chip that reveals a date-time input.
//
//   value: the selected preset id, "custom", or null (nothing highlighted —
//          e.g. an existing link whose expiry doesn't match a preset)
//   customAt / onCustomAt: the custom timestamp (ms) when value === "custom"

import { ChipGroup } from "@/features/settings/controls";
import { EXPIRY_PRESETS, type ExpiryPresetId } from "../shareStatus";

export type ExpiryChoice = ExpiryPresetId | "custom";

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ExpiryChips({
  value,
  onChange,
  allowCustom = false,
  customAt,
  onCustomAt,
}: {
  value: ExpiryChoice | null;
  onChange: (id: ExpiryChoice) => void;
  allowCustom?: boolean;
  customAt?: number | null;
  onCustomAt?: (ms: number) => void;
}) {
  const options = [
    ...EXPIRY_PRESETS.map((p) => ({ value: p.id as ExpiryChoice, label: p.label })),
    ...(allowCustom ? [{ value: "custom" as ExpiryChoice, label: "Custom…" }] : []),
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <ChipGroup ariaLabel="Expires" value={value} onChange={onChange} options={options} />
      {allowCustom && value === "custom" ? (
        <input
          type="datetime-local"
          aria-label="Custom expiry"
          min={toLocalInput(Date.now() + 60_000)}
          value={customAt ? toLocalInput(customAt) : ""}
          onChange={(e) => {
            const ms = new Date(e.target.value).getTime();
            if (Number.isFinite(ms)) onCustomAt?.(ms);
          }}
          className="h-8 w-fit rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
        />
      ) : null}
    </div>
  );
}
