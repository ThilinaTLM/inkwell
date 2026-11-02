// New project / Project settings dialog: name, icon, colour, description, status.

import { HugeiconsIcon } from "@hugeicons/react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ProjectIcon } from "@/components/project/ProjectIcon";
import {
  PROJECT_COLOR_KEYS,
  PROJECT_COLORS,
  PROJECT_ICON_KEYS,
  PROJECT_ICONS,
  PROJECT_STATUS_META,
  type ProjectStatus,
} from "@/components/project/projectStyle";
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
import { useCreateFolder, useFolders, useUpdateFolder } from "@/data/folders";
import {
  FOLDER_COLORS,
  FOLDER_ICONS,
  type FolderColor,
  type FolderIcon,
  type FolderMeta,
  MAX_FOLDER_DESCRIPTION,
} from "@/lib/api/client";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { closeProjectDialog, projectDialogStore } from "./projectDialogStore";

const STATUSES: ProjectStatus[] = ["active", "paused", "done"];

export function ProjectDialogHost() {
  const open = useStore(projectDialogStore, (s) => s.open);
  const folders = useFolders();
  if (!open) return null;
  const folder = open.folderId ? folders.data?.find((f) => f.id === open.folderId) : undefined;
  if (open.folderId && !folder) return null;
  return <ProjectDialog key={open.nonce} folder={folder} />;
}

function ProjectDialog({ folder }: { folder?: FolderMeta }) {
  const editing = !!folder;
  const navigate = useNavigate();
  const create = useCreateFolder();
  const update = useUpdateFolder();
  const [open, setOpen] = useState(true);
  const [name, setName] = useState(folder?.name ?? "");
  const [icon, setIcon] = useState<string>(folder?.icon ?? "folder");
  const [color, setColor] = useState<string>(folder?.color ?? "orange");
  const [description, setDescription] = useState(folder?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(folder?.status ?? "active");
  const busy = create.isPending || update.isPending;

  const close = (o: boolean) => {
    if (o) return;
    setOpen(false);
    setTimeout(closeProjectDialog, 150);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    const meta = {
      icon: icon as FolderIcon,
      color: color as FolderColor,
      description: description.trim() || null,
      status,
    };
    try {
      if (folder) {
        await update.mutateAsync({
          id: folder.id,
          patch: { ...(trimmed !== folder.name ? { name: trimmed } : {}), ...meta },
        });
        toast.success("Project updated");
        close(false);
      } else {
        const created = await create.mutateAsync({ name: trimmed, parentId: null, ...meta });
        toast.success(`Created project "${created.name}"`);
        close(false);
        navigate(`/folders/${created.id}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save project");
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-medium">
            {editing ? "Edit project" : "New project"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Change how this project looks and where it stands."
              : "A project groups related notes, boards and files."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-end gap-3">
            <ProjectIcon icon={icon} color={color} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Website relaunch"
                disabled={busy}
              />
            </div>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Icon</legend>
            <div className="grid grid-cols-6 gap-1.5">
              {PROJECT_ICON_KEYS.filter((k) => (FOLDER_ICONS as readonly string[]).includes(k)).map(
                (k) => (
                  <button
                    key={k}
                    type="button"
                    aria-label={k}
                    aria-pressed={icon === k}
                    onClick={() => setIcon(k)}
                    className={cn(
                      "grid h-10 place-items-center rounded-[10px] border text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                      icon === k
                        ? "border-primary bg-accent-soft text-accent-text"
                        : "border-border bg-card",
                    )}
                  >
                    <HugeiconsIcon icon={PROJECT_ICONS[k]} strokeWidth={1.8} className="size-5" />
                  </button>
                ),
              )}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLOR_KEYS.filter((k) =>
                (FOLDER_COLORS as readonly string[]).includes(k),
              ).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={PROJECT_COLORS[k].label}
                  aria-pressed={color === k}
                  onClick={() => setColor(k)}
                  className={cn(
                    "size-7 rounded-full outline-none ring-offset-2 ring-offset-popover transition-shadow focus-visible:ring-2 focus-visible:ring-ring/60",
                    PROJECT_COLORS[k].swatch,
                    color === k && "ring-2 ring-foreground",
                  )}
                />
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-description">
              Description <span className="font-normal text-faint">(optional)</span>
            </Label>
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, MAX_FOLDER_DESCRIPTION))}
              rows={2}
              disabled={busy}
              placeholder="What is this project about?"
              className="min-h-16 resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Status</legend>
            <div
              role="radiogroup"
              aria-label="Status"
              className="inline-flex self-start rounded-[10px] border border-border bg-card p-0.5"
            >
              {STATUSES.map((s) => (
                // biome-ignore lint/a11y/useSemanticElements: segmented control built from buttons
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={status === s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "h-7 rounded-lg px-3.5 text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                    status === s && "bg-accent font-medium text-foreground",
                  )}
                >
                  {PROJECT_STATUS_META[s].label}
                </button>
              ))}
            </div>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {editing ? "Save" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
