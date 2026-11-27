// Small tile icon for an item by type/kind (trash rows, share rows).

import { ProjectIcon } from "@/components/project/ProjectIcon";
import type { ProjectFields } from "@/components/project/projectStyle";
import type { CollectionItem, CollectionKind } from "@/features/collection";
import { KindIcon } from "@/features/collection/CollectionPreview";

export function TargetIcon({
  type,
  kind,
  folder,
}: {
  type: "file" | "folder";
  kind?: string | null;
  folder?: ProjectFields | null;
}) {
  if (type === "folder") return <ProjectIcon folder={folder} size="sm" />;
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-2">
      <KindIcon
        item={{ kind: (kind ?? "file") as CollectionKind } as CollectionItem}
        className="size-4"
      />
    </span>
  );
}
