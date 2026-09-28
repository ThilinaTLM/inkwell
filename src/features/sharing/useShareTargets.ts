// Resolves share targets (name, kind, location, parent) from the folder
// list and the all-files listing, for the Shared links table and panel.
//
// PUBLIC CONTRACT
//   interface ShareTarget { ref; name; kind?; location; parentId; itemCount?; exists }
//   useShareTargets(): { resolve(share): ShareTarget; allFiles: FileMeta[]; folders: FolderMeta[] }

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useFolders } from "@/data/folders";
import { folderPathLabel } from "@/features/actions/itemCache";
import { type FileKind, type FileMeta, files, type ItemRef, type Share } from "@/lib/api/client";
import { keys } from "@/lib/api/query-keys";

export interface ShareTarget {
  ref: ItemRef;
  name: string;
  kind?: FileKind;
  location: string;
  parentId: string | null;
  itemCount?: number;
  exists: boolean;
}

const ALL_FILES = {} as const;

export function useShareTargets() {
  const folders = useFolders();
  const all = useQuery({
    queryKey: keys.files.list(ALL_FILES),
    queryFn: () => files.list(ALL_FILES),
  });
  const folderList = folders.data ?? [];
  const fileList = all.data ?? [];
  const fileById = useMemo(() => new Map(fileList.map((f) => [f.id, f])), [fileList]);
  const folderById = useMemo(() => new Map(folderList.map((f) => [f.id, f])), [folderList]);

  const resolve = useCallback(
    (s: Share): ShareTarget => {
      const ref: ItemRef = { type: s.targetType, id: s.targetId };
      if (s.targetType === "folder") {
        const f = folderById.get(s.targetId);
        return {
          ref,
          name: f?.name ?? s.targetName ?? "(untitled)",
          location: folderPathLabel(folderList, f?.parentId ?? null),
          parentId: f?.parentId ?? null,
          itemCount: f ? f.fileCount + f.subfolderCount : undefined,
          exists: !!f,
        };
      }
      const f: FileMeta | undefined = fileById.get(s.targetId);
      return {
        ref,
        name: f?.name ?? s.targetName ?? "(untitled)",
        kind: f?.kind,
        location: folderPathLabel(folderList, f?.folderId ?? null),
        parentId: f?.folderId ?? null,
        exists: !!f,
      };
    },
    [fileById, folderById, folderList],
  );

  return { resolve, allFiles: fileList, folders: folderList };
}
