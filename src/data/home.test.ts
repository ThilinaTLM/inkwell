import { describe, expect, it } from "vitest";
import type { FileMeta, FolderMeta } from "@/lib/api/client";
import { buildProjects, folderPath, withLocation } from "./home";

const folder = (id: string, parentId: string | null, fileCount = 0): FolderMeta => ({
  id,
  parentId,
  name: id.toUpperCase(),
  tags: [],
  fileCount,
  subfolderCount: 0,
  previews: [],
  activeShareCount: 0,
  starredAt: null,
  icon: null,
  color: null,
  description: null,
  status: null,
  pinnedAt: null,
  createdAt: 1,
  updatedAt: 1,
});

const file = (id: string, folderId: string | null): FileMeta => ({
  id,
  folderId,
  name: id,
  kind: "notes",
  tags: [],
  version: 1,
  sizeBytes: 0,
  mime: null,
  hasThumb: false,
  thumbUpdatedAt: 0,
  activeShareCount: 0,
  starredAt: null,
  createdAt: 1,
  updatedAt: 1,
});

const tree = [folder("a", null, 2), folder("b", "a", 3), folder("c", "b", 1), folder("d", null)];

describe("buildProjects", () => {
  it("returns top-level folders with recursive counts", () => {
    const projects = buildProjects(tree);
    expect(projects.map((p) => p.id)).toEqual(["a", "d"]);
    expect(projects[0]).toMatchObject({ totalFileCount: 6, totalFolderCount: 2, itemCount: 8 });
    expect(projects[1]).toMatchObject({ totalFileCount: 0, totalFolderCount: 0, itemCount: 0 });
  });
});

describe("folderPath / withLocation", () => {
  it("builds root-first breadcrumbs", () => {
    expect(folderPath(tree, "c").map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(folderPath(tree, null)).toEqual([]);
    expect(folderPath(tree, "nope")).toEqual([]);
  });
  it("annotates files with path and project", () => {
    const [inbox, deep] = withLocation([file("x", null), file("y", "c")], tree);
    expect(inbox).toMatchObject({ folderPath: [], project: null });
    expect(deep.project).toEqual({ id: "a", name: "A" });
    expect(deep.folderPath).toHaveLength(3);
  });
});
