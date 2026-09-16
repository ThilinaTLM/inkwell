// AppTopbar — the sticky header of the authenticated app shell.
//
// Left:   mobile menu button + sidebar collapse toggle
// Middle: global search that submits to `/files?q=…`
// Right:  the "New" menu (file kinds + folder) and the shared <UserMenu>
//
// Borderless on purpose: separation from page content comes from the
// translucent background + blur, not a hairline rule.

import {
  FolderAddIcon,
  Menu01Icon,
  PlusSignIcon,
  Search01Icon,
  SidebarLeft01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { FileKindGlyph } from "@/components/file-kinds/file-kind-icons";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { useItemActions } from "@/features/explorer/ExplorerActionsProvider";
import type { User } from "@/lib/api/client";
import { FILE_KIND_LIST } from "@/lib/file-kinds";
import { cn } from "@/lib/utils";

interface AppTopbarProps {
  user: User;
  onToggleSidebar: () => void;
  onOpenMobileNav: () => void;
  onOpenPalette: () => void;
}

export function AppTopbar({
  user,
  onToggleSidebar,
  onOpenMobileNav,
  onOpenPalette,
}: AppTopbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(params.get("q") ?? "");
  const actions = useItemActions();

  // Keep the field in sync when the URL changes underneath us (back /
  // forward, sidebar navigation, palette jumps).
  const urlQ = params.get("q") ?? "";
  useEffect(() => {
    setQ(urlQ);
  }, [urlQ]);

  // `/` focuses search from anywhere in the shell.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    const target = location.pathname.startsWith("/files") ? "/files" : "/files";
    navigate(term ? `${target}?q=${encodeURIComponent(term)}` : target);
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 bg-background/85 px-3 backdrop-blur supports-backdrop-filter:bg-background/70 sm:px-4">
      <Button
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        aria-label="Open navigation"
        onClick={onOpenMobileNav}
      >
        <HugeiconsIcon icon={Menu01Icon} strokeWidth={1.7} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="hidden md:inline-flex"
        aria-label="Toggle sidebar"
        onClick={onToggleSidebar}
      >
        <HugeiconsIcon icon={SidebarLeft01Icon} strokeWidth={1.7} />
      </Button>

      <form onSubmit={submit} className="relative min-w-0 max-w-md flex-1">
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={1.7}
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          placeholder="Search files…"
          aria-label="Search files"
          className={cn(
            "h-8 w-full rounded-md border border-border bg-card pl-8 pr-16 text-xs text-foreground",
            "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          )}
        />
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Open command palette"
          className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 sm:block"
        >
          <Kbd keys={["mod", "K"]} />
        </button>
      </form>

      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" aria-label="Create new" />}>
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            <span className="hidden sm:inline">New</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="min-w-52">
            {FILE_KIND_LIST.map((k) => (
              <DropdownMenuItem key={k.id} onClick={() => actions.createFile(k.id)}>
                <FileKindGlyph kind={k.id} className="size-4" />
                {k.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => actions.createFolderIn(actions.currentFolderId)}>
              <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
              New folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <UserMenu user={user} />
      </div>
    </header>
  );
}
