// Compact tooltipped icon button. Used by the share-row action cluster
// (edit / rotate / revoke) and the inline copy-link button on the URL
// row. Pulled out so the row composition stays terse and so the
// destructive-tint convention lives in one place.

import type { Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function IconAction({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Copy01Icon;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClick}
            aria-label={label}
          />
        }
      >
        <HugeiconsIcon
          icon={icon}
          strokeWidth={2}
          className={destructive ? "text-destructive" : undefined}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
