// Mobile (<768px) bottom bar: Home · Recents · ＋ · Search · Files.
// ＋ opens the New menu (Note · Whiteboard · Diagram · HTML site · Folder · Upload)
// and creates in the current folder, else loose files.

import {
  Add01Icon,
  Clock01Icon,
  FolderLibraryIcon,
  Home01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Link, useLocation } from "react-router-dom";
import { NewMenu } from "@/features/pages/NewMenu";
import { cn } from "@/lib/utils";
import { openPalette } from "./shellStore";

const itemClass =
  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10.5px] font-medium text-muted-foreground outline-none transition-colors focus-visible:text-foreground data-[active=true]:text-primary";

function BarLink({
  to,
  icon,
  label,
  active,
}: {
  to: string;
  icon: IconSvgElement;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      data-active={active}
      aria-current={active ? "page" : undefined}
      className={itemClass}
    >
      <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-[22px]" />
      {label}
    </Link>
  );
}

export function MobileBottomBar() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex shrink-0 items-stretch border-t border-border bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur",
      )}
    >
      <BarLink to="/" icon={Home01Icon} label="Home" active={pathname === "/"} />
      <BarLink
        to="/recents"
        icon={Clock01Icon}
        label="Recents"
        active={pathname.startsWith("/recents")}
      />
      <div className="flex flex-1 items-center justify-center">
        <NewMenu
          side="top"
          align="center"
          trigger={
            <button
              type="button"
              aria-label="New"
              className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-pop outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2.2} className="size-5" />
            </button>
          }
        />
      </div>
      <button type="button" onClick={() => openPalette()} className={itemClass}>
        <HugeiconsIcon icon={Search01Icon} strokeWidth={1.8} className="size-[22px]" />
        Search
      </button>
      <BarLink
        to="/files"
        icon={FolderLibraryIcon}
        label="Files"
        active={pathname.startsWith("/files")}
      />
    </nav>
  );
}
