import {
  Add01Icon,
  ArtboardToolIcon,
  FlowIcon,
  FolderAddIcon,
  Globe02Icon,
  MoreHorizontalIcon,
  Note01Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/** "+ New" dropdown acting on the shell's current folder:
 *  Note · Whiteboard · Folder · Upload · More › Diagram, HTML site, Upload folder. */
/** `mobile` keeps the button visible on phones (the bottom bar's ＋ already
 *  covers the header use, so headers leave it off). */
export function NewMenu({ label = "New", mobile = false }: { label?: string; mobile?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className={cn("h-9 rounded-[10px] px-3.5 text-[13px]", !mobile && "max-md:hidden")}
          />
        }
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Create</DropdownMenuLabel>
        <Row id="file.new.notes" label="Note" icon={Note01Icon} />
        <Row id="file.new.excalidraw" label="Whiteboard" icon={ArtboardToolIcon} />
        <Row id="file.newFolder" label="Folder" icon={FolderAddIcon} />
        <DropdownMenuSeparator />
        <Row id="file.upload" label="Upload files…" icon={Upload01Icon} />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} />
            More
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <Row id="file.new.drawio" label="Diagram" icon={FlowIcon} />
            <Row id="file.new.static-site" label="HTML site" icon={Globe02Icon} />
            <Row id="file.uploadFolder" label="Upload folder…" icon={Upload01Icon} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
