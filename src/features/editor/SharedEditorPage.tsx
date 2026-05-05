// SharedEditor handles both forms of share token:
//   /share/:token                  → file-share (loads /api/share/:token)
//   /share/:token/files/:fileId    → folder-share file (loads /api/share/:token/files/:fileId)
//
// Like Editor, this is a zero-chrome canvas page. File name + save / read-only
// status are rendered in the patched-in top-left slot via ExcalidrawEditor's
// internal `renderTopLeftUI` wiring (see `ExcalidrawTopLeftStrip`). The
// dedicated back icon button in that strip handles "back to folder" on
// folder-share file routes; on a top-level file-share token there's no parent
// and the back button is hidden. The MainMenu hamburger (relocated to the
// top-right next to Library by our Excalidraw patch) surfaces a reduced
// action set:
//   • Share-permission sub-label ("Shared · can edit" / "Shared · view only")
//   • Download (only when the share grants downloads)
//   • Default Excalidraw items (theme, save-as-image, help)
// Read-only shares get the canvas in view mode; the top-left strip surfaces
// the read-only state via the EyeIcon variant. Visitors never see
// rename/share-from-share since they don't own the file.

import { MainMenu } from "@excalidraw/excalidraw";
import { Download01Icon, EyeIcon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSharedFile } from "@/data/shares";
import DrawioEditor from "@/features/editor/DrawioEditor";
import ExcalidrawEditor from "@/features/editor/ExcalidrawEditor";
import type { FileBlob, LoadedFile } from "@/lib/api/client";
import { shares } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";
import { errorMessage } from "@/lib/errors";
import { useTheme } from "@/lib/theme";
import { EditorErrorState, EditorLoadingState } from "./EditorChrome";

interface SharedEditorProps {
  /** Optional preloaded file; used by SharedTokenLanding to avoid a double fetch. */
  preloaded?: LoadedFile;
}

export default function SharedEditorPage({ preloaded }: SharedEditorProps = {}) {
  const params = useParams<{ token: string; fileId?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const token = params.token || "";
  const fileId = params.fileId; // present only on folder-share routes

  // Skip the network when the parent page already resolved the file.
  const fileQuery = useSharedFile(preloaded ? "" : token, fileId);

  const [loaded, setLoaded] = useState<LoadedFile | null>(preloaded ?? null);
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  // Seed working copy on first arrival; thereafter the editor owns it.
  useEffect(() => {
    if (loaded) return;
    if (fileQuery.data) setLoaded(fileQuery.data);
  }, [fileQuery.data, loaded]);

  // Force-fresh reload after a 409 conflict.
  const reload = useCallback(async () => {
    const ls = await qc.fetchQuery({
      queryKey: keys.publicShare.token(token, fileId),
      queryFn: () => (fileId ? shares.loadFolderFile(token, fileId) : shares.load(token)),
      staleTime: 0,
    });
    setLoaded(ls);
    return ls;
  }, [qc, token, fileId]);

  const save = useCallback(
    async (version: number, blob: FileBlob) => {
      const m = fileId
        ? await shares.saveFolderFile(token, fileId, version, blob)
        : await shares.save(token, version, blob);
      const nextLoaded: LoadedFile = {
        meta: {
          id: loaded?.meta.id ?? fileId ?? "",
          name: m.name,
          kind: m.kind,
          version: m.version,
          updatedAt: m.updatedAt,
          folderId: loaded?.meta.folderId ?? null,
          hasThumb: loaded?.meta.hasThumb ?? false,
        },
        blob,
        permission: loaded?.permission ?? "write",
        allowDownload: loaded?.allowDownload ?? true,
      };
      setLoaded(nextLoaded);
      qc.setQueryData(keys.publicShare.token(token, fileId), nextLoaded);
      return { version: m.version };
    },
    [
      loaded?.allowDownload,
      loaded?.meta.folderId,
      loaded?.meta.hasThumb,
      loaded?.meta.id,
      loaded?.permission,
      qc,
      token,
      fileId,
    ],
  );

  if (fileQuery.isError) {
    return (
      <EditorErrorState message={errorMessage(fileQuery.error, "could not load shared file")} />
    );
  }
  if (!loaded) return <EditorLoadingState label="Loading shared file…" />;

  const writable = loaded.permission === "write";
  const downloadHref = fileId
    ? shares.folderFileDownloadUrl(token, fileId)
    : shares.downloadUrl(token);

  if (loaded.meta.kind === "drawio") {
    return (
      <div className="h-dvh w-dvw bg-background">
        <DrawioEditor
          loaded={loaded}
          save={writable ? save : async () => ({ version: loaded.meta.version })}
          reload={reload}
          onReload={(ls) => setLoaded(ls)}
          back={fileId ? { onClick: () => navigate(`/share/${token}`), label: "Back" } : null}
          actions={
            // Rendered into draw.io's native menubar via portal — see
            // DrawioEditor.tsx. Tailwind/shadcn classes don't apply inside
            // the iframe document, so we use the `inkwell-native-btn` class
            // injected by DrawioEditor.
            loaded.allowDownload ? (
              <button
                type="button"
                className="inkwell-native-btn inkwell-native-btn--primary"
                onClick={() => {
                  window.location.href = downloadHref;
                }}
              >
                Download .drawio
              </button>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <div className="h-dvh w-dvw bg-background">
      <ExcalidrawEditor
        loaded={loaded}
        save={writable ? save : async () => ({ version: loaded.meta.version })}
        saveThumb={null}
        reload={reload}
        onReload={(ls) => setLoaded(ls)}
        back={
          fileId ? { onClick: () => navigate(`/share/${token}`), label: "Back to folder" } : null
        }
        chrome={
          <MainMenu>
            {/* File name + save status / read-only state render in the
                top-left strip. Here we keep just the share-permission
                line, which clarifies the *source* of any "Read-only"
                indicator users see in that strip. */}
            <MainMenu.ItemCustom>
              <div className="px-2 pb-2 pt-1">
                <span className="flex items-center gap-1 text-xs text-muted-foreground/70">
                  {writable ? (
                    <>
                      <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.8} className="size-3" />
                      Shared · can edit
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={EyeIcon} strokeWidth={1.8} className="size-3" />
                      Shared · view only
                    </>
                  )}
                </span>
              </div>
            </MainMenu.ItemCustom>
            <MainMenu.Separator />

            {/* "Back to folder" is now exposed as the dedicated back icon
                button in the top-left strip, so we don't duplicate it as a
                menu entry. */}
            {loaded.allowDownload && (
              <MainMenu.ItemLink
                href={downloadHref}
                icon={<HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />}
              >
                Download .excalidraw
              </MainMenu.ItemLink>
            )}

            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme
              allowSystemTheme
              theme={themeMode}
              onSelect={setThemeMode}
            />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.Help />
          </MainMenu>
        }
      />
    </div>
  );
}
