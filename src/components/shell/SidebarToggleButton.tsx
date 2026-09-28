import { SidebarLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatKeys } from "@/lib/commands/keymap";
import { getEffectiveKeys } from "@/lib/commands/registry";
import { toggleSidebar, useShellState } from "./shellStore";

/** Desktop sidebar toggle shared by page-level toolbars. */
export function SidebarToggleButton() {
  const isMobile = useShellState((state) => state.isMobile);
  if (isMobile) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Toggle sidebar"
            onClick={toggleSidebar}
            className="text-muted-foreground"
          />
        }
      >
        <HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={2} className="size-4" />
      </TooltipTrigger>
      <TooltipContent>
        Toggle sidebar ({formatKeys(getEffectiveKeys("view.sidebar"))})
      </TooltipContent>
    </Tooltip>
  );
}
