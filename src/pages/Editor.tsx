// Editor — the canvas page. Zero outer chrome: the page is a full-viewport
// Excalidraw canvas. The scene name and every Inkwell action live inside
// Excalidraw's own MainMenu (top-left); the save status pill lives in
// Excalidraw's Footer (bottom-center). Loading / error states are paper
// surfaces with a hand-written message.

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MainMenu, Footer } from "@excalidraw/excalidraw";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  ArrowLeft01Icon,
  Download01Icon,
  Edit02Icon,
  HashtagIcon,
  Loading03Icon,
  PencilEdit02Icon,
  Share08Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { ApiError, LoadedScene, SceneBlob, scenes, tags as tagsApi, Tag } from "@/api";
import SceneEditor, { EditorSaveBadge } from "@/components/SceneEditor";
import { ShareDialog } from "@/components/ShareDialog";
import { TagEditDialog } from "@/components/TagEditDialog";
import { PaperSurface } from "@/components/PaperSurface";
import { SceneNameLabel } from "@/components/sketch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Editor() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<LoadedScene | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [allTags, setAllTags] = useState<Tag[] | null>(null);
  // We don't have scene tags in LoadedScene meta, so we fetch them lazily
  // (only when the user opens the tags dialog).
  const [sceneTags, setSceneTags] = useState<string[] | null>(null);

  const reload = useCallback(async () => {
    const ls = await scenes.load(id);
    setLoaded(ls);
    return ls;
  }, [id]);

  useEffect(() => {
    setLoaded(null);
    setErr(null);
    reload().catch((e) =>
      setErr(e instanceof ApiError ? e.message : "load failed")
    );
  }, [reload]);

  const save = useCallback(
    async (version: number, blob: SceneBlob) => {
      const m = await scenes.save(id, version, blob);
      setLoaded((prev) =>
        prev
          ? {
              ...prev,
              meta: {
                ...prev.meta,
                name: m.name,
                version: m.version,
                updatedAt: m.updatedAt,
              },
            }
          : prev
      );
      return { version: m.version };
    },
    [id]
  );

  const saveThumb = useCallback((svg: string) => scenes.putThumb(id, svg), [id]);

  // Lazy-load scene tags + tag suggestions when the tags dialog is opened.
  useEffect(() => {
    if (!tagsOpen || sceneTags !== null) return;
    void (async () => {
      try {
        const [scene, all] = await Promise.all([
          scenes.list({ q: undefined }).then((rows) =>
            rows.find((r) => r.id === id)
          ),
          tagsApi.list(),
        ]);
        setSceneTags(scene?.tags ?? []);
        setAllTags(all);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "could not load tags");
        setTagsOpen(false);
      }
    })();
  }, [tagsOpen, id, sceneTags]);

  if (err) {
    return <EditorErrorState message={err} />;
  }
  if (!loaded) {
    return <EditorLoadingState label="Loading scene…" />;
  }

  return (
    <div className="h-dvh w-dvw bg-paper">
      <SceneEditor
        loaded={loaded}
        save={save}
        saveThumb={saveThumb}
        reload={reload}
        onReload={(ls) => setLoaded(ls)}
        chrome={
          <>
            <MainMenu>
              {/* Excalidraw owns the actual MainMenu trigger (a hamburger
                  icon at top-left) and ignores any custom <MainMenu.Trigger>.
                  We surface the scene name two ways instead:
                    1. as a non-interactive header inside the menu (here)
                    2. as a paper pill in <Footer> alongside the save status
                  so the user always sees what document they're editing. */}
              <MainMenu.ItemCustom>
                <div className="flex flex-col gap-0.5 px-2 pb-2 pt-1">
                  <span className="font-hand text-xs text-ink-muted">
                    Editing
                  </span>
                  <span
                    className="truncate font-heading text-base text-ink"
                    title={loaded.meta.name}
                  >
                    {loaded.meta.name}
                  </span>
                </div>
              </MainMenu.ItemCustom>
              <MainMenu.Separator />

              <MainMenu.Item
                icon={
                  <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} />
                }
                onSelect={() => navigate("/")}
              >
                Back to scenes
              </MainMenu.Item>
              <MainMenu.Item
                icon={<HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} />}
                onSelect={() => setRenameOpen(true)}
              >
                Rename…
              </MainMenu.Item>
              <MainMenu.Item
                icon={<HugeiconsIcon icon={Share08Icon} strokeWidth={1.8} />}
                onSelect={() => setShareOpen(true)}
              >
                Share…
              </MainMenu.Item>
              <MainMenu.ItemLink
                href={scenes.downloadUrl(id)}
                icon={
                  <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
                }
              >
                Download .excalidraw
              </MainMenu.ItemLink>
              <MainMenu.Item
                icon={<HugeiconsIcon icon={HashtagIcon} strokeWidth={1.8} />}
                onSelect={() => setTagsOpen(true)}
              >
                Edit tags…
              </MainMenu.Item>
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ToggleTheme />
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.DefaultItems.Help />
            </MainMenu>

            <Footer>
              <SceneNameLabel name={loaded.meta.name} />
              <EditorSaveBadge />
            </Footer>
          </>
        }
      />

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        currentName={loaded.meta.name}
        onRename={async (next) => {
          try {
            const m = await scenes.rename(id, next);
            setLoaded((prev) =>
              prev ? { ...prev, meta: { ...prev.meta, name: m.name } } : prev
            );
            toast.success(`Renamed to "${m.name}".`);
            setRenameOpen(false);
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "rename failed");
          }
        }}
      />

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        targetType="scene"
        targetId={id}
        targetName={loaded.meta.name}
      />

      {tagsOpen && sceneTags !== null && allTags !== null ? (
        <TagEditDialog
          open
          onOpenChange={(o) => {
            if (!o) setTagsOpen(false);
          }}
          initialTags={sceneTags}
          suggestions={allTags.map((t) => t.name)}
          title={`Tags for "${loaded.meta.name}"`}
          onSave={async (next) => {
            const result = await scenes.setTags(id, next);
            return result.tags;
          }}
          onSaved={async (next) => {
            setSceneTags(next);
            toast.success("Tags updated.");
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Rename dialog ──────────────────────────────────────────────────────

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentName: string;
  onRename: (next: string) => Promise<void>;
}

function RenameDialog({
  open,
  onOpenChange,
  currentName,
  onRename,
}: RenameDialogProps) {
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = name.trim();
    if (!next || next === currentName) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      await onRename(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename scene</DialogTitle>
          <DialogDescription>
            This is what you'll see on the dashboard.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-input">Name</Label>
            <Input
              id="rename-input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Loading + error chrome (full-page paper surfaces) ─────────────────

export function EditorLoadingState({ label }: { label: string }) {
  return (
    <PaperSurface
      variant="page"
      className="grid place-items-center text-ink-soft"
    >
      <div className="flex items-center gap-2 font-hand text-base">
        <HugeiconsIcon
          icon={Loading03Icon}
          strokeWidth={2}
          className="size-4 animate-spin"
        />
        {label}
      </div>
    </PaperSurface>
  );
}

export function EditorErrorState({ message }: { message: string }) {
  return (
    <PaperSurface variant="page" className="grid place-items-center px-4">
      <div
        className="flex max-w-sm flex-col items-center gap-3 rounded-lg bg-paper-elev p-6 text-center text-ink ring-1 ring-ink-soft/15"
        style={{ transform: "rotate(-0.6deg)" }}
      >
        <HugeiconsIcon
          icon={Alert02Icon}
          strokeWidth={2}
          className="size-6 text-vermillion"
        />
        <div className="space-y-1">
          <div className="font-heading text-lg">Couldn't load this scene</div>
          <p className="font-hand text-base text-ink-soft">{message}</p>
        </div>
        <Button variant="outline" size="sm" render={<Link to="/" />}>
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          Back to dashboard
        </Button>
      </div>
    </PaperSurface>
  );
}

// Re-export so SharedEditor can keep using these without importing PaperSurface.
export const EditorPencilIcon = PencilEdit02Icon;
