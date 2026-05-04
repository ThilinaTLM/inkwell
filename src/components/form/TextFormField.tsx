import type { AnyFieldApi } from "@tanstack/react-form";
import { useStore } from "@tanstack/react-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface TextFormFieldProps {
  field: AnyFieldApi;
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  required?: boolean;
  minLength?: number;
  className?: string;
}

/**
 * Binds a TanStack Form field to shadcn Input + Label + error text.
 */
export function TextFormField({
  field,
  label,
  type = "text",
  placeholder,
  autoComplete,
  disabled,
  required,
  minLength,
  className,
}: TextFormFieldProps) {
  const meta = useStore(field.store, (state) => state.meta);
  const error = meta.errorMap.onChange ?? meta.errorMap.onBlur;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={field.name}>
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      <Input
        id={field.name}
        name={field.name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        disabled={disabled}
        required={required}
        minLength={minLength}
        aria-invalid={!!error}
      />
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
