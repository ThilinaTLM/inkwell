// NewFileButton — primary "+ New file" affordance in the explorer.
//
// Plain solid button that opens the `<NewFileDialog>` picker via
// `onClick`. Replaces the previous `<NewFileSplitButton>` (and its
// per-user "default file kind" preference) with a single, consistent
// entry point: every "New file" surface — header, empty-state CTA,
// both context-menu variants — funnels through the same picker.
//
// Two callsites use this with different `size`s (header = default,
// empty-state CTA = lg), so the icon + label + aria-label live in one
// component rather than being duplicated inline.

import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";

export interface NewFileButtonProps {
  onClick: () => void;
  /** Visual size — mirrors `<Button size>`. */
  size?: "default" | "lg";
  /** When true, the "New file" label collapses on `<sm` widths and only
   *  the `+` icon shows; the button still announces "New file" via
   *  `aria-label`. Used in the explorer header so the breadcrumb has
   *  more room on phones. Empty-state CTAs leave this `false` so the
   *  call-to-action stays self-explanatory. */
  collapseLabelOnMobile?: boolean;
}

export function NewFileButton({
  onClick,
  size = "default",
  collapseLabelOnMobile = false,
}: NewFileButtonProps) {
  return (
    <Button size={size} onClick={onClick} aria-label="New file">
      <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
      <span className={collapseLabelOnMobile ? "hidden sm:inline" : undefined}>New file</span>
    </Button>
  );
}
