// Labelled switch (role="switch") with a simple onChange(boolean) API.

import { Switch } from "@/components/ui/switch";

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  title,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  title?: string;
  id?: string;
}) {
  return (
    <Switch
      id={id}
      checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onCheckedChange={onChange}
    />
  );
}
