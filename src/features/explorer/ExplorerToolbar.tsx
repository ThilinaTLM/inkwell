// Explorer toolbar (wireframe `explorerToolbar()`): back / forward / up,
// breadcrumb (every crumb a drop target, "…" collapses ancestors into a
// dropdown), filter, New folder, Upload ▾, sort, view switcher, details
// toggle.
//
// Below 768px (screen 23) a compact row is rendered instead: Up,
// breadcrumb, a filter toggle and a ⋯ menu holding the secondary actions
// (back/forward, new folder, upload, sort, view, details). The FAB on
// the explorer page covers New / Upload as the primary touch entry.

import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  ArrowUp02Icon,
  FilterIcon,
  FolderAddIcon,
  FolderUploadIcon,
  GridViewIcon,
  Home01Icon,
  LayoutThreeColumnIcon,
  LeftToRightListBulletIcon,
  Menu01Icon,
  MoreHorizontalIcon,
  SidebarRightIcon,
  SortingAZ02Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useShell } from "@/components/shell/AppShell";
import { ToolbarSearch } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { itemActions } from "@/features/actions/useItemActions";
import { openUploadPicker } from "@/features/upload";
import type { FolderMeta } from "@/lib/api/client";
import { formatKeys } from "@/lib/commands/keymap";
import { getEffectiveKeys, runCommand } from "@/lib/commands/registry";
import { type ExplorerView, type SortKey, useExplorerPref } from "@/lib/explorerPrefs";
import { cn } from "@/lib/utils";

const VIEWS: Array<{ view: ExplorerView; label: string; icon: IconSvgElement }> = [
  { view: "grid", label: "Grid", icon: GridViewIcon },
  { view: "compact", label: "Compact", icon: Menu01Icon },
  { view: "list", label: "Details", icon: LeftToRightListBulletIcon },
  { view: "columns", label: "Columns", icon: LayoutThreeColumnIcon },
];

export const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  modified: "Date modified",
  created: "Date created",
  size: "Size",
  kind: "Kind",
};

const IMPORTS: Array<{ label: string; accept: string }> = [
  { label: ".excalidraw / .json → Excalidraw", accept: ".excalidraw,.json" },
  { label: ".drawio / .xml → Draw.io", accept: ".drawio,.xml" },
  { label: ".md / .txt → Notes", accept: ".md,.markdown,.txt" },
  { label: ".zip / .html → Static site", accept: ".zip,.html,.htm" },
];

function keysOf(id: string) {
  return formatKeys(getEffectiveKeys(id));
}

function IconBtn({
  label,
  icon,
  onClick,
  disabled,
  pressed,
}: {
  label: string;
  icon: IconSvgElement;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={pressed}
            disabled={disabled}
            onClick={onClick}
            className={cn(pressed && "bg-muted text-foreground")}
          />
        }
      >
        <HugeiconsIcon icon={icon} strokeWidth={1.9} className="size-4" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ExplorerToolbar({
  folderId,
  path,
  filter,
  onFilter,
  view,
  onView,
}: {
  folderId: string | null;
  /** Ancestors + current folder (root excluded). */
  path: FolderMeta[];
  filter: string;
  onFilter: (v: string) => void;
  view: ExplorerView;
  onView: (v: ExplorerView) => void;
}) {
  const shell = useShell();
  const [sort, setSort] = useExplorerPref("sort");
  const [foldersFirst, setFoldersFirst] = useExplorerPref("foldersFirst");

  if (shell.isMobile) {
    return (
      <MobileToolbar
        folderId={folderId}
        path={path}
        filter={filter}
        onFilter={onFilter}
        view={view}
        onView={onView}
      />
    );
  }

  return (
    <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-3">
      <IconBtn
        label={`Back (${keysOf("nav.back")})`}
        icon={ArrowLeft01Icon}
        onClick={() => history.back()}
      />
      <IconBtn
        label={`Forward (${keysOf("nav.forward")})`}
        icon={ArrowRight01Icon}
        onClick={() => history.forward()}
      />
      <IconBtn
        label={`Up (${keysOf("nav.parent")})`}
        icon={ArrowUp02Icon}
        disabled={folderId === null}
        onClick={() => runCommand("nav.parent")}
      />
      <Breadcrumb path={path} />
      <div className="flex-1" />
      <ToolbarSearch
        value={filter}
        onChange={onFilter}
        placeholder={path.length ? "Filter this folder" : "Filter Home"}
        className="hidden w-[200px] md:flex"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => itemActions.newFolder(folderId)}
        className="hidden lg:inline-flex"
      >
        <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
        New folder
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          <HugeiconsIcon icon={Upload01Icon} strokeWidth={2} />
          <span className="hidden sm:inline">Upload</span>
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onClick={() => openUploadPicker({ folderId })}>
            <HugeiconsIcon icon={Upload01Icon} strokeWidth={2} />
            Upload files…
            <DropdownMenuShortcut>{keysOf("file.upload")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openUploadPicker({ folderId, directory: true })}>
            <HugeiconsIcon icon={FolderUploadIcon} strokeWidth={2} />
            Upload folder…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Import</DropdownMenuLabel>
          {IMPORTS.map((imp) => (
            <DropdownMenuItem
              key={imp.accept}
              onClick={() => openUploadPicker({ folderId, accept: imp.accept })}
            >
              <span className="size-4" aria-hidden />
              {imp.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" aria-label="Sort" />}
              />
            }
          >
            <HugeiconsIcon icon={SortingAZ02Icon} strokeWidth={1.9} className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Sort</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={sort.key}
            onValueChange={(v) => {
              const key = v as SortKey;
              setSort({ key, dir: key === "name" || key === "kind" ? "asc" : "desc" });
            }}
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <DropdownMenuRadioItem key={k} value={k}>
                {SORT_LABELS[k]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setSort({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" })}
          >
            <HugeiconsIcon
              icon={sort.dir === "asc" ? ArrowUp01Icon : ArrowDown01Icon}
              strokeWidth={2}
            />
            {sort.dir === "asc" ? "Ascending" : "Descending"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setFoldersFirst(!foldersFirst)}>
            <span className="grid size-4 place-items-center text-xs" aria-hidden>
              {foldersFirst ? "✓" : ""}
            </span>
            Folders first
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <fieldset
        aria-label="View"
        className="inline-flex overflow-hidden rounded-lg border border-border bg-card"
      >
        {VIEWS.map((v) => {
          const on = view === v.view;
          return (
            <Tooltip key={v.view}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={`${v.label} view`}
                    aria-pressed={on}
                    data-view={v.view}
                    onClick={() => onView(v.view)}
                    className={cn(
                      "grid h-7 w-[30px] place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      on &&
                        "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  />
                }
              >
                <HugeiconsIcon icon={v.icon} strokeWidth={1.9} className="size-[15px]" />
              </TooltipTrigger>
              <TooltipContent>
                {v.label} ({keysOf(`view.${v.view}`)})
              </TooltipContent>
            </Tooltip>
          );
        })}
      </fieldset>
      <IconBtn
        label={`Details panel (${keysOf("view.details")})`}
        icon={SidebarRightIcon}
        pressed={shell.detailsOpen}
        onClick={() => shell.toggleDetails()}
      />
    </div>
  );
}

// ─── Mobile toolbar ─────────────────────────────────────────────────────

function MobileToolbar({
  folderId,
  path,
  filter,
  onFilter,
  view,
  onView,
}: {
  folderId: string | null;
  path: FolderMeta[];
  filter: string;
  onFilter: (v: string) => void;
  view: ExplorerView;
  onView: (v: ExplorerView) => void;
}) {
  const shell = useShell();
  const [sort, setSort] = useExplorerPref("sort");
  const [foldersFirst, setFoldersFirst] = useExplorerPref("foldersFirst");
  const [filterOpen, setFilterOpen] = useState(false);
  const showFilter = filterOpen || filter !== "";

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Up one folder"
          disabled={folderId === null}
          onClick={() => runCommand("nav.parent")}
        >
          <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={1.9} className="size-4" />
        </Button>
        <div className="min-w-0 flex-1 overflow-hidden">
          <Breadcrumb path={path} />
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Filter"
          aria-pressed={showFilter}
          onClick={() => {
            if (showFilter) {
              onFilter("");
              setFilterOpen(false);
            } else setFilterOpen(true);
          }}
          className={cn(showFilter && "bg-muted")}
        >
          <HugeiconsIcon icon={FilterIcon} strokeWidth={1.9} className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="More actions"
                data-testid="explorer-more"
              />
            }
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.9} className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onClick={() => history.back()}>
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
              Back
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => history.forward()}>
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
              Forward
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => itemActions.newFolder(folderId)}>
              <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
              New folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openUploadPicker({ folderId })}>
              <HugeiconsIcon icon={Upload01Icon} strokeWidth={2} />
              Upload files…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openUploadPicker({ folderId, directory: true })}>
              <HugeiconsIcon icon={FolderUploadIcon} strokeWidth={2} />
              Upload folder…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>View</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={view} onValueChange={(v) => onView(v as ExplorerView)}>
              {VIEWS.filter((v) => v.view !== "columns").map((v) => (
                <DropdownMenuRadioItem key={v.view} value={v.view}>
                  {v.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sort.key}
              onValueChange={(v) => {
                const key = v as SortKey;
                setSort({ key, dir: key === "name" || key === "kind" ? "asc" : "desc" });
              }}
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <DropdownMenuRadioItem key={k} value={k}>
                  {SORT_LABELS[k]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuItem
              onClick={() => setSort({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" })}
            >
              <HugeiconsIcon
                icon={sort.dir === "asc" ? ArrowUp01Icon : ArrowDown01Icon}
                strokeWidth={2}
              />
              {sort.dir === "asc" ? "Ascending" : "Descending"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFoldersFirst(!foldersFirst)}>
              <span className="grid size-4 place-items-center text-xs" aria-hidden>
                {foldersFirst ? "✓" : ""}
              </span>
              Folders first
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => shell.toggleDetails()}>
              <HugeiconsIcon icon={SidebarRightIcon} strokeWidth={2} />
              {shell.detailsOpen ? "Hide details" : "Show details"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {showFilter ? (
        <div className="shrink-0 border-b border-border px-2 py-1.5">
          <ToolbarSearch
            value={filter}
            onChange={onFilter}
            placeholder={path.length ? "Filter this folder" : "Filter Home"}
            className="w-full"
          />
        </div>
      ) : null}
    </>
  );
}

// ─── Breadcrumb ─────────────────────────────────────────────────────────

const crumbClass =
  "rounded-md px-1.5 py-0.5 whitespace-nowrap text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 " +
  "data-[drop-over=true]:bg-accent data-[drop-over=true]:text-accent-foreground data-[drop-over=true]:outline-dashed data-[drop-over=true]:outline-[1.5px] data-[drop-over=true]:outline-primary " +
  "data-[file-drop-over=true]:bg-accent data-[file-drop-over=true]:text-accent-foreground data-[file-drop-over=true]:outline-dashed data-[file-drop-over=true]:outline-[1.5px] data-[file-drop-over=true]:outline-primary";

function dropAttrs(id: string | null, name: string) {
  return {
    "data-drop-folder": id ?? "root",
    "data-drop-name": name,
    "data-spring-nav": id ?? "root",
  };
}

export function Breadcrumb({ path }: { path: FolderMeta[] }) {
  const navigate = useNavigate();
  const MAX_VISIBLE = 3;
  const hidden = path.length > MAX_VISIBLE ? path.slice(0, path.length - (MAX_VISIBLE - 1)) : [];
  const visible = hidden.length ? path.slice(hidden.length) : path;
  const sep = (
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      strokeWidth={2}
      className="size-3 shrink-0 text-muted-foreground/60"
    />
  );
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-0.5 text-sm">
      <Link
        to="/"
        aria-label="Home"
        title="Home"
        {...dropAttrs(null, "Home")}
        aria-current={path.length === 0 ? "page" : undefined}
        className={cn(
          crumbClass,
          "flex items-center gap-1",
          path.length === 0 && "font-semibold text-foreground",
        )}
      >
        <HugeiconsIcon icon={Home01Icon} strokeWidth={1.9} className="size-3.5" />
        {path.length === 0 ? <span>Home</span> : null}
      </Link>
      {hidden.length ? (
        <>
          {sep}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button type="button" aria-label="Show hidden folders" className={crumbClass} />
              }
            >
              …
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              {hidden.map((f) => (
                <DropdownMenuItem
                  key={f.id}
                  onClick={() => navigate(`/folders/${f.id}`)}
                  {...dropAttrs(f.id, f.name)}
                >
                  {f.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
      {visible.map((f, i) => {
        const last = i === visible.length - 1;
        return (
          <span key={f.id} className="flex min-w-0 items-center gap-0.5">
            {sep}
            <Link
              to={`/folders/${f.id}`}
              {...dropAttrs(f.id, f.name)}
              aria-current={last ? "page" : undefined}
              className={cn(
                crumbClass,
                "min-w-0 truncate",
                last && "font-semibold text-foreground",
              )}
              title={f.name}
            >
              {f.name}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
