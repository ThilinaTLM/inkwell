import { Add01Icon, FolderAddIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { FileKindGlyph } from "@/components/icons/file-kind-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FileKind } from "@/lib/api/client";
import { runCommand } from "@/lib/commands/registry";
import { cn } from "@/lib/utils";

function Row({ id, label, icon }: { id: string; label: string; icon: IconSvgElement }) {
  return (
    <DropdownMenuItem onClick={() => runCommand(id)}>
      <HugeiconsIcon icon={icon} strokeWidth={1.8} />
      {label}
    </DropdownMenuItem>
  );
}

/** Creatable kinds use their brand glyph so Note / Whiteboard / Diagram / HTML site read as equals. */
function KindRow({ kind, label }: { kind: FileKind; label: string }) {
  return (
    <DropdownMenuItem onClick={() => runCommand(`file.new.${kind}`)}>
      <FileKindGlyph kind={kind} className="size-4" />
      {label}
    </DropdownMenuItem>
  );
}

/** "+ New" dropdown acting on the shell's current folder:
 *  Note · Whiteboard · Diagram · HTML site · Folder · Upload files · Upload folder.
 *  `mobile` keeps the button visible on phones (the bottom bar's ＋ already
 *  covers the header use, so headers leave it off). `trigger` swaps the
 *  default button (used by the bottom bar's ＋). */
export function NewMenu({
  label = "New",
  mobile = false,
  trigger,
  side,
  align = "end",
}: {
  label?: string;
  mobile?: boolean;
  trigger?: React.ReactElement;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          trigger ?? (
            <Button
              className={cn("h-9 rounded-[10px] px-3.5 text-[13px]", !mobile && "max-md:hidden")}
            />
          )
        }
      >
        {trigger ? null : (
          <>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            {label}
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-56">
        <DropdownMenuLabel>Create</DropdownMenuLabel>
        <KindRow kind="notes" label="Note" />
        <KindRow kind="excalidraw" label="Whiteboard" />
        <KindRow kind="drawio" label="Diagram" />
        <KindRow kind="static-site" label="HTML site" />
        <DropdownMenuSeparator />
        <Row id="file.newFolder" label="Folder" icon={FolderAddIcon} />
        <Row id="file.upload" label="Upload files…" icon={Upload01Icon} />
        <Row id="file.uploadFolder" label="Upload folder…" icon={Upload01Icon} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
