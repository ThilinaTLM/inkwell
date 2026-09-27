// Settings → Explorer: every key of `src/lib/explorerPrefs.ts`.

import { Button } from "@/components/ui/button";
import { formatKeys } from "@/lib/commands/keymap";
import { getEffectiveKeys } from "@/lib/commands/registry";
import {
  EXPLORER_PREF_DEFAULTS,
  type ExplorerPrefKey,
  type ExplorerView,
  type ListColumn,
  resetExplorerPref,
  type SortKey,
  type ThumbSize,
  useExplorerPref,
} from "@/lib/explorerPrefs";
import { Segmented, SettingRow, SettingsGroup, Toggle } from "../controls";

const COLUMNS: Array<{ value: ListColumn; label: string }> = [
  { value: "kind", label: "Kind" },
  { value: "modified", label: "Modified" },
  { value: "created", label: "Created" },
  { value: "size", label: "Size" },
  { value: "tags", label: "Tags" },
  { value: "location", label: "Location" },
  { value: "shared", label: "Shared" },
];

export function ExplorerSection() {
  const [defaultView, setDefaultView] = useExplorerPref("defaultView");
  const [thumbSize, setThumbSize] = useExplorerPref("thumbSize");
  const [sort, setSort] = useExplorerPref("sort");
  const [foldersFirst, setFoldersFirst] = useExplorerPref("foldersFirst");
  const [detailsPanel, setDetailsPanel] = useExplorerPref("detailsPanel");
  const [openWith, setOpenWith] = useExplorerPref("openWith");
  const [openFilesIn, setOpenFilesIn] = useExplorerPref("openFilesIn");
  const [altDrag, setAltDrag] = useExplorerPref("altDrag");
  const [uploadConflict, setUploadConflict] = useExplorerPref("uploadConflict");
  const [confirmTrash, setConfirmTrash] = useExplorerPref("confirmTrash");
  const [singleKey, setSingleKey] = useExplorerPref("singleKeyShortcuts");
  const [listColumns, setListColumns] = useExplorerPref("listColumns");
  const [widths] = useExplorerPref("listColumnWidths");

  const toggleColumn = (c: ListColumn) => {
    const has = listColumns.includes(c);
    const next = has ? listColumns.filter((x) => x !== c) : [...listColumns, c];
    setListColumns(["name", ...next.filter((x) => x !== "name")]);
  };

  return (
    <>
      <SettingsGroup
        title="Layout"
        description="Defaults for new folders. Each folder remembers your last choice."
      >
        <SettingRow label="Default view" help="Keys 1–4 switch anytime">
          <Segmented<ExplorerView>
            ariaLabel="Default view"
            value={defaultView}
            onChange={setDefaultView}
            options={[
              { value: "grid", label: "Grid" },
              { value: "compact", label: "Compact" },
              { value: "list", label: "Details" },
              { value: "columns", label: "Columns" },
            ]}
          />
        </SettingRow>
        <SettingRow
          label="Thumbnail size"
          help={`${formatKeys(getEffectiveKeys("view.thumbBigger")) || "⌘+"} / ${formatKeys(getEffectiveKeys("view.thumbSmaller")) || "⌘−"} in the explorer`}
        >
          <Segmented<ThumbSize>
            ariaLabel="Thumbnail size"
            value={thumbSize}
            onChange={setThumbSize}
            options={[
              { value: "s", label: "S" },
              { value: "m", label: "M" },
              { value: "l", label: "L" },
              { value: "xl", label: "XL" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Sort by">
          <select
            aria-label="Sort key"
            value={sort.key}
            onChange={(e) => setSort({ ...sort, key: e.target.value as SortKey })}
            className="h-7 w-[140px] rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
          >
            <option value="name">Name</option>
            <option value="modified">Modified</option>
            <option value="created">Created</option>
            <option value="size">Size</option>
            <option value="kind">Kind</option>
          </select>
          <Segmented<"asc" | "desc">
            ariaLabel="Sort direction"
            value={sort.dir}
            onChange={(dir) => setSort({ ...sort, dir })}
            options={[
              {
                value: "asc",
                label: sort.key === "name" || sort.key === "kind" ? "A→Z" : "Oldest",
              },
              {
                value: "desc",
                label: sort.key === "name" || sort.key === "kind" ? "Z→A" : "Newest",
              },
            ]}
          />
          <span className="ml-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Toggle label="Folders first" checked={foldersFirst} onChange={setFoldersFirst} />
            Folders first
          </span>
        </SettingRow>
        <SettingRow label="Details panel" help="I toggles it anytime">
          <Segmented
            ariaLabel="Details panel"
            value={detailsPanel}
            onChange={setDetailsPanel}
            options={[
              { value: "hidden", label: "Hidden" },
              { value: "remember", label: "Remember" },
              { value: "always", label: "Always" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Details view columns" help="Name is always shown">
          <div className="flex flex-wrap gap-1">
            {COLUMNS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={listColumns.includes(c.value)}
                onClick={() => toggleColumn(c.value)}
                className="inline-flex h-6 items-center rounded-full border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted aria-pressed:border-primary/50 aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              >
                {c.label}
              </button>
            ))}
          </div>
          {Object.keys(widths).length ? (
            <Button variant="ghost" size="sm" onClick={() => resetExplorerPref("listColumnWidths")}>
              Reset widths
            </Button>
          ) : null}
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Behaviour" description="Power-user switches.">
        <SettingRow label="Open items with">
          <Segmented
            ariaLabel="Open items with"
            value={openWith}
            onChange={setOpenWith}
            options={[
              { value: "double", label: "Double-click" },
              { value: "single", label: "Single click" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Open files in">
          <Segmented
            ariaLabel="Open files in"
            value={openFilesIn}
            onChange={setOpenFilesIn}
            options={[
              { value: "same", label: "Same tab" },
              { value: "new", label: "New tab" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Drag with ⌥/Alt" help="Default drag always moves">
          <Segmented
            ariaLabel="Alt-drag behaviour"
            value={altDrag}
            onChange={setAltDrag}
            options={[
              { value: "duplicate", label: "Duplicate" },
              { value: "ask", label: "Ask" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Upload name conflicts">
          <Segmented
            ariaLabel="Upload name conflicts"
            value={uploadConflict}
            onChange={setUploadConflict}
            options={[
              { value: "ask", label: "Ask" },
              { value: "keepBoth", label: "Keep both" },
              { value: "replace", label: "Replace" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Confirm before moving to Trash" help="Undo is always available">
          <Toggle
            label="Confirm before moving to Trash"
            checked={confirmTrash}
            onChange={setConfirmTrash}
          />
        </SettingRow>
        <SettingRow
          label="Single-key shortcuts"
          help="Disable if they conflict with assistive tech"
        >
          <Toggle label="Single-key shortcuts" checked={singleKey} onChange={setSingleKey} />
        </SettingRow>
      </SettingsGroup>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            for (const k of Object.keys(EXPLORER_PREF_DEFAULTS) as ExplorerPrefKey[])
              resetExplorerPref(k);
          }}
        >
          Reset explorer settings
        </Button>
      </div>
    </>
  );
}
