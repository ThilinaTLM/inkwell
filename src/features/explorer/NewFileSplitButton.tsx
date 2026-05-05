// NewFileSplitButton — primary "New file" affordance in the explorer.
//
// Shape:
//
//   ┌──────────────────────────┬───┐
//   │ + New Excalidraw file    │ ▾ │
//   └──────────────────────────┴───┘
//
// The left button creates a file using the user's current default kind
// (persisted via `useDefaultFileKind` → `localStorage`). The right
// chevron opens a `<DropdownMenu>` listing both kinds; picking one both
// creates the file *and* updates the default for next time, so the
// header reflects the user's last preference.
//
// Why a single split-button (vs. two side-by-side buttons): the explorer
// header just dropped from 3 buttons → 2 (`New folder` + this), and a
// split-button keeps the second affordance discoverable without crowding
// the bar with a third primary surface. The selected kind also becomes
// the default for the right-click menu's "primary" file action elsewhere
// — kept in `localStorage` so all surfaces stay in sync.
//
// Accessibility:
//   - The chevron button has `aria-label="Choose a file type"` and
//     `aria-haspopup="menu"`.
//   - The primary button's accessible label updates with the default
//     ("New Excalidraw file" / "New draw.io file") so screen readers
//     always announce what will happen.

import { ArrowDown01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { FileKindGlyph, fileKindLabel } from "@/components/sketch/file-kind-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDefaultFileKind } from "@/features/explorer/hooks";
import type { FileKind } from "@/lib/api/client";

export interface NewFileSplitButtonProps {
  /** Called with the file kind the user picked. The split-button itself
   *  also updates `localStorage` so the next render reflects the new default. */
  onCreate: (kind: FileKind) => void;
  /** Visual size — pages other than the explorer header (e.g. the empty
   *  state) want a larger CTA. Mirrors `<Button size>`. */
  size?: "default" | "lg";
}

/**
 * Two visually-fused buttons sharing a rounded container — the left
 * fires the default action, the right opens the kind picker.
 */
export function NewFileSplitButton({ onCreate, size = "default" }: NewFileSplitButtonProps) {
  const [defaultKind, setDefaultKind] = useDefaultFileKind();
  const label = `New ${fileKindLabel(defaultKind)}`;

  const onPick = (kind: FileKind) => {
    setDefaultKind(kind);
    onCreate(kind);
  };

  return (
    // `inline-flex` + sibling rounding so the two buttons read as a
    // single split control. `-ml-px` hides the seam between them.
    <span className="inline-flex">
      <Button
        size={size}
        onClick={() => onCreate(defaultKind)}
        aria-label={label}
        className="rounded-r-none"
      >
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size={size}
              aria-label="Choose a file type"
              aria-haspopup="menu"
              className="rounded-l-none border-l border-primary-foreground/15 px-2 -ml-px"
            >
              <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onPick("excalidraw")}>
            <FileKindGlyph kind="excalidraw" />
            Excalidraw file
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onPick("drawio")}>
            <FileKindGlyph kind="drawio" />
            draw.io file
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
