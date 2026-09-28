// Empty folder state (screen 12). The pane around it is the drop
// target (OS files upload here, dragged items move here); the dashed
// frame brightens while something is dragged over the pane.

import { ClipboardPasteIcon, FolderAddIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Kbd, KeyCombo } from "@/components/shell/Kbd";
import { Button } from "@/components/ui/button";
import { useClipboard } from "@/features/actions/clipboard";
import { itemActions } from "@/features/actions/useItemActions";
import { openUploadPicker } from "@/features/upload";
import { getEffectiveKeys } from "@/lib/commands/registry";
import { KIND_META, KIND_ORDER } from "./model";
import { ItemIcon } from "./views/ItemVisuals";

export function EmptyFolder({ folderId, name }: { folderId: string | null; name: string }) {
  const clip = useClipboard();
  const k = (id: string) => getEffectiveKeys(id)[0];
  return (
    <div className="absolute inset-6 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border p-6 text-center transition-colors in-data-[drop-over=true]:border-primary in-data-[drop-over=true]:bg-accent/30 in-data-[file-drop-over=true]:border-primary in-data-[file-drop-over=true]:bg-accent/30 sm:inset-10">
      <p className="font-display text-3xl leading-tight font-normal italic text-foreground sm:text-4xl">
        “{name}” is empty
      </p>
      <p className="text-sm text-muted-foreground">Drop files here, or pick something to start.</p>
      <div className="mt-1.5 flex flex-wrap justify-center gap-2.5" data-no-marquee="">
        {KIND_ORDER.map((kind) => (
          <Button
            key={kind}
            variant="outline"
            onClick={() => void itemActions.newFile(folderId, kind)}
          >
            <ItemIcon kind={kind} />
            {KIND_META[kind].label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2.5" data-no-marquee="">
        <Button variant="outline" onClick={() => itemActions.newFolder(folderId)}>
          <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} />
          New folder {k("file.newFolder") ? <KeyCombo binding={k("file.newFolder")} /> : null}
        </Button>
        <Button variant="outline" onClick={() => openUploadPicker({ folderId })}>
          <HugeiconsIcon icon={Upload01Icon} strokeWidth={2} />
          Upload {k("file.upload") ? <KeyCombo binding={k("file.upload")} /> : null}
        </Button>
        {clip.items.length ? (
          <Button variant="ghost" onClick={() => void itemActions.paste(folderId)}>
            <HugeiconsIcon icon={ClipboardPasteIcon} strokeWidth={2} />
            Paste {clip.items.length} item{clip.items.length === 1 ? "" : "s"}{" "}
            {k("item.paste") ? <KeyCombo binding={k("item.paste")} /> : null}
          </Button>
        ) : null}
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
        Tip: press <Kbd>N</Kbd> to create, or drag files from your desktop.
      </p>
    </div>
  );
}
