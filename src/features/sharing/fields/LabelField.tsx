// Optional human-readable label for a share link. The 200-char ceiling
// matches the worker's column constraint; trimming + null-coalescing
// (empty string → null) is the caller's responsibility because the
// create and edit forms differ on what an empty value means.

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LabelField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Label (optional)</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Q4 review"
        maxLength={200}
      />
    </div>
  );
}
