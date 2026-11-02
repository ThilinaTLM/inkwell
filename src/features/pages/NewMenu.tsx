import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NEW_MENU_IDS } from "@/features/actions/itemCommands";
import { CommandMenuItems } from "@/lib/commands/CommandMenuItems";
import { cn } from "@/lib/utils";

/** "+ New" dropdown (file kinds, folder, upload) acting on the shell's current folder. */
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
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Create</DropdownMenuLabel>
        <CommandMenuItems ids={NEW_MENU_IDS} as="dropdown" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
