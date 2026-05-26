// NewFileDialog — picker that lets the user choose what kind of file
// to create.
//
// Centered modal with one card per file kind (currently Excalidraw and
// Draw.io). Clicking a card calls `onPick(kind)` and the parent closes
// the dialog and dispatches the actual create call. This component is
// purely presentational — the dashboard owns the `useCreateFile`
// mutation and the post-create navigation.
//
// Replaces the old split-button + dual context-menu entries with a
// single picker shared by every "New file" entry point (header
// button, empty-state CTA, both context-menu variants). The card
// layout scales to additional kinds by appending to `CARDS` and
// adjusting `grid-cols-*`.

import { FileKindBadge, fileKindLabel } from "@/components/sketch/file-kind-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FileKind } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface NewFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (kind: FileKind) => void;
}

interface KindCard {
  kind: FileKind;
  title: string;
  description: string;
}

// Title + description copy is lifted verbatim from the old
// "Default file kind" Settings row so wording stays consistent
// across the app even though that row is being deleted.
const CARDS: ReadonlyArray<KindCard> = [
  {
    kind: "excalidraw",
    title: "Excalidraw",
    description: "Hand-drawn whiteboard, fast and simple.",
  },
  {
    kind: "drawio",
    title: "Draw.io",
    description: "Structured diagrams with shapes and connectors.",
  },
  {
    kind: "notes",
    title: "Notes",
    description: "Rich text notes with headings, lists and embeds.",
  },
  {
    kind: "static-site",
    title: "Static site",
    description: "Upload HTML, CSS, and JS files (or a .zip) and share the rendered page.",
  },
];

export function NewFileDialog({ open, onOpenChange, onPick }: NewFileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New file</DialogTitle>
          <DialogDescription>Choose what kind of file to create.</DialogDescription>
        </DialogHeader>
        {/* Base UI's Dialog moves focus to the first focusable
         *  element on open, so the first card receives focus
         *  naturally without an explicit `autoFocus` attribute. */}
        {/* Four cards — stacked single column on the narrowest screens,
         *  then a 2x2 grid from `sm` upward so the picker stays compact. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CARDS.map((c) => (
            <KindCardButton key={c.kind} card={c} onPick={() => onPick(c.kind)} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KindCardButton({ card, onPick }: { card: KindCard; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Create new ${fileKindLabel(card.kind)}`}
      className={cn(
        // Paper-card framing matching the rest of the app's sketch
        // surfaces: hairline ring, soft hover lift, visible focus ring.
        "group flex flex-col items-start gap-2 rounded-xl border border-border/60",
        "bg-card/60 p-4 text-left transition",
        "hover:border-border hover:bg-card hover:-translate-y-px",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <FileKindBadge kind={card.kind} className="size-9" />
      <div className="font-heading text-sm font-semibold text-foreground">{card.title}</div>
      <div className="text-xs text-muted-foreground">{card.description}</div>
    </button>
  );
}
