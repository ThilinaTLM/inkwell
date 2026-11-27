// NewFileDialog — asks for a path (`styles.css`, `css/site.css`) and
// validates it against the bundle before creating an unsaved buffer.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { validateNewPath } from "./sitePaths";

export function NewFileDialog({
  open,
  onOpenChange,
  existing,
  initial,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: string[];
  initial?: string;
  onCreate: (path: string) => void;
}) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initial ?? "");
      setTouched(false);
    }
  }, [open, initial]);

  const check = validateNewPath(value, existing);
  const error = touched && !check.ok ? check.error : null;
  const submit = () => {
    setTouched(true);
    if (check.ok) {
      onCreate(check.path);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>New file</DialogTitle>
            <DialogDescription>
              Type a path. Use a slash to put it in a folder, e.g. <code>css/site.css</code>. The
              file is saved with your next Save.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Input
              autoFocus
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setTouched(true);
              }}
              placeholder="styles.css"
              aria-label="File path"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "new-file-error" : undefined}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-mono"
              data-testid="new-file-input"
            />
            {error ? (
              <p id="new-file-error" role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!check.ok} data-testid="new-file-create">
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
