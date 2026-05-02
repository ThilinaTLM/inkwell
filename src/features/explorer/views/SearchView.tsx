// SearchView — global search across every owned scene, with the
// existing tag chip strip alongside the query input.
//
// URL: `?view=search&q=<text>&tag=<name>&tag=<name>`. Both `q` and tag
// filters live in the URL so search results are linkable and survive
// reload. Folder name search is out of scope for v1; the query matches
// scene names only.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  HashtagIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import {
  ApiError,
  FolderMeta,
  SceneMeta,
  Tag,
  scenes as scenesApi,
} from "@/api";
import { SceneCard, TagFilterStrip } from "@/components/sketch";
import { cn } from "@/lib/utils";

import { ItemContextMenu, type ItemMenuActions } from "./ItemContextMenu";
import { useExplorerHotkeys } from "./useExplorerHotkeys";

interface SearchViewProps {
  query: string;
  onQueryChange: (next: string) => void;
  activeTags: string[];
  onToggleTag: (name: string) => void;
  tags: Tag[] | null;
  folders: FolderMeta[] | null;
  actions: ItemMenuActions;
  refreshTick?: number;
}

export function SearchView({
  query,
  onQueryChange,
  activeTags,
  onToggleTag,
  tags,
  folders,
  actions,
  refreshTick = 0,
}: SearchViewProps) {
  const navigate = useNavigate();
  const debouncedQ = useDebouncedValue(query, 200);
  const [results, setResults] = useState<SceneMeta[] | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Autofocus when the view mounts so typing flows naturally.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let alive = true;
    setResults(null);
    scenesApi
      .list({
        q: debouncedQ || undefined,
        tags: activeTags.length ? activeTags : undefined,
      })
      .then((rows) => {
        if (alive) setResults(rows);
      })
      .catch((e: ApiError) => {
        if (alive) {
          toast.error(e.message || "search failed");
          setResults([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [debouncedQ, activeTags, refreshTick]);

  const folderById = useMemo(
    () => new Map((folders ?? []).map((f) => [f.id, f])),
    [folders]
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  useExplorerHotkeys(containerRef, {
    onRename: (item) => {
      if (item.kind !== "scene") return;
      const s = results?.find((x) => x.id === item.id);
      if (s) actions.renameScene(s);
    },
    onDelete: (item) => {
      if (item.kind !== "scene") return;
      const s = results?.find((x) => x.id === item.id);
      if (s) actions.deleteScene(s);
    },
    onOpen: (item) => {
      if (item.kind !== "scene") return;
      const s = results?.find((x) => x.id === item.id);
      if (s) actions.openScene(s);
    },
  });

  return (
    <div ref={containerRef} className="flex flex-col" tabIndex={-1}>
      {/* Search input */}
      <div className="px-6 pb-2 pt-2">
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={1.6}
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
          />
          <input
            ref={inputRef}
            type="search"
            placeholder="Search scenes…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className={cn(
              "w-full rounded-md bg-paper-elev/60 py-3 pl-10 pr-3 font-sans text-base text-ink",
              "placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-vermillion/30",
              "border-b border-ink-soft/40 focus:border-vermillion/60 transition-colors"
            )}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onQueryChange("")}
              className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-ink-soft hover:bg-manila-soft/50 hover:text-ink"
            >
              <HugeiconsIcon
                icon={Cancel01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
            </button>
          )}
        </div>
      </div>

      {/* Tag filter strip */}
      <TagFilterStrip tags={tags} active={activeTags} onToggle={onToggleTag} />

      {/* Active filter pills */}
      {activeTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-6 pb-2 pt-1">
          <span className="font-hand text-sm text-ink-muted">Filtering by:</span>
          {activeTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onToggleTag(t)}
              className="inline-flex items-center gap-1 rounded-full bg-manila-soft px-2 py-0.5 font-sans text-[0.6875rem] text-ink hover:bg-manila"
            >
              <HugeiconsIcon
                icon={HashtagIcon}
                strokeWidth={2}
                className="size-2.5 opacity-70"
              />
              {t}
              <HugeiconsIcon
                icon={Cancel01Icon}
                strokeWidth={2}
                className="size-2.5 opacity-70"
              />
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {results === null ? (
        <Skeleton />
      ) : results.length === 0 ? (
        <div className="px-6 py-16 text-center font-hand text-lg text-ink-muted">
          {query || activeTags.length
            ? `No scenes match${query ? ` "${query}"` : ""}.`
            : "Start typing to search your scenes."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 px-6 pb-16 pt-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {results.map((s) => {
            const parent = s.folderId ? folderById.get(s.folderId) : null;
            return (
              <ItemContextMenu
                key={s.id}
                target={{ kind: "scene", scene: s }}
                actions={actions}
              >
                <SceneCard
                  id={s.id}
                  name={s.name}
                  hasThumb={s.hasThumb}
                  thumbUrl={`/api/scenes/${s.id}/thumb?v=${s.version}`}
                  folderName={parent?.name ?? "Top level"}
                  updatedAtLabel={relTime(s.updatedAt)}
                  tags={s.tags}
                  onOpen={() => navigate(`/s/${s.id}`)}
                />
              </ItemContextMenu>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 px-6 pt-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="aspect-[4/3] w-full animate-pulse rounded-md bg-paper-edge/50"
        />
      ))}
    </div>
  );
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}
