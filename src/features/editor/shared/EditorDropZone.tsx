// Drag-in import for editor pages.
//
// Editors live outside AppShell, so without this a file dropped on the
// page would make the browser navigate to it (and Excalidraw / draw.io
// / CodeMirror would try to swallow it themselves). While an OS file
// drag is over the window we mount a full-page cover — it also sits
// above the draw.io iframe, which would otherwise eat the events — and
// hand the drop to the shared upload queue, targeting the open file's
// folder. Only drags carrying "Files" are touched; in-page text/element
// drags pass straight through.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useFolders } from "@/data/folders";
import {
  collectDrop,
  DropOverlay,
  dragHasFiles,
  UploadTray,
  uploadEntries,
} from "@/features/upload";

export interface EditorDropZoneProps {
  /** Folder the dropped files are uploaded into (`null` = Inbox / root). */
  folderId: string | null;
  /** Open that folder (guarded by the editor's leave-confirm). */
  onOpenFolder: () => void;
}

export function EditorDropZone({ folderId, onOpenFolder }: EditorDropZoneProps) {
  const [active, setActive] = useState(false);
  const folders = useFolders();
  const folderName = folderId
    ? (folders.data?.find((f) => f.id === folderId)?.name ?? "this folder")
    : "Inbox";
  const nameRef = useRef(folderName);
  nameRef.current = folderName;
  const openRef = useRef(onOpenFolder);
  openRef.current = onOpenFolder;
  const folderRef = useRef(folderId);
  folderRef.current = folderId;

  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (dragHasFiles(e.dataTransfer)) setActive(true);
    };
    // Never let the browser navigate to a dropped file, wherever it lands.
    const swallow = (e: DragEvent) => {
      if (dragHasFiles(e.dataTransfer)) e.preventDefault();
    };
    const reset = () => setActive(false);
    window.addEventListener("dragenter", onEnter, true);
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    window.addEventListener("dragend", reset, true);
    return () => {
      window.removeEventListener("dragenter", onEnter, true);
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
      window.removeEventListener("dragend", reset, true);
    };
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActive(false);
    if (!dragHasFiles(e.dataTransfer)) return;
    const target = folderRef.current;
    void collectDrop(e.dataTransfer).then((entries) => {
      if (entries.length === 0) return;
      uploadEntries(entries, target);
      toast(`Uploading to “${nameRef.current}”`, {
        action: { label: "Open folder", onClick: () => openRef.current() },
      });
    });
  };

  return (
    <>
      <UploadTray />
      {active ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: transient drag-and-drop cover, not an interactive control
        <div
          className="fixed inset-0 z-[60]"
          data-testid="editor-drop-zone"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            // Leaving the window → relatedTarget is null.
            if (!e.relatedTarget) setActive(false);
          }}
          onDrop={onDrop}
        >
          <DropOverlay visible targetName={folderName} className="fixed" />
        </div>
      ) : null}
    </>
  );
}
