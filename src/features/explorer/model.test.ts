import { describe, expect, it } from "vitest";
import type { FileMeta, FolderMeta } from "@/lib/api/client";
import { filterItems, sortItems, summarize, toExplorerItems } from "./model";

const folder = (id: string, name: string, updatedAt = 1): FolderMeta => ({
  id,
  name,
  parentId: null,
  tags: [],
  fileCount: 1,
  subfolderCount: 0,
  previews: [],
  activeShareCount: 0,
  starredAt: null,
  createdAt: 1,
  updatedAt,
});
const file = (id: string, name: string, extra: Partial<FileMeta> = {}): FileMeta => ({
  id,
  name,
  folderId: null,
  kind: "excalidraw",
  tags: [],
  version: 1,
  sizeBytes: 100,
  hasThumb: false,
  thumbUpdatedAt: 0,
  activeShareCount: 0,
  starredAt: null,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const items = toExplorerItems(
  [folder("f1", "Zeta"), folder("f2", "alpha")],
  [
    file("a", "file 10", { sizeBytes: 5, updatedAt: 3 }),
    file("b", "file 2", { kind: "notes", tags: ["Meeting"], updatedAt: 9 }),
    file("c", "Another", { kind: "drawio", sizeBytes: 500 }),
  ],
);

describe("sortItems", () => {
  it("sorts by name naturally with folders first", () => {
    expect(sortItems(items, { key: "name", dir: "asc" }).map((i) => i.name)).toEqual([
      "alpha",
      "Zeta",
      "Another",
      "file 2",
      "file 10",
    ]);
  });
  it("supports desc, foldersFirst=false and secondary keys", () => {
    const s = sortItems(
      items,
      [
        { key: "kind", dir: "asc" },
        { key: "modified", dir: "desc" },
      ],
      { foldersFirst: false },
    );
    expect(s.map((i) => i.id)).toEqual(["f2", "f1", "c", "a", "b"]);
    expect(
      sortItems(items, { key: "size", dir: "desc" })
        .map((i) => i.id)
        .slice(2),
    ).toEqual(["c", "b", "a"]);
  });
  it("custom getters", () => {
    const s = sortItems(
      items,
      { key: "len", dir: "asc" },
      { getters: { len: (i) => i.name.length } },
    );
    expect(s[2].name).toBe("file 2");
  });
});

describe("filterItems", () => {
  it("filters by text, kind and tag", () => {
    expect(filterItems(items, { text: "FILE" }).map((i) => i.id)).toEqual(["a", "b"]);
    expect(filterItems(items, { text: "meet" }).map((i) => i.id)).toEqual(["b"]);
    expect(filterItems(items, { kinds: ["drawio", "notes"] }).map((i) => i.id)).toEqual(["b", "c"]);
    expect(filterItems(items, { tag: "meeting" }).map((i) => i.id)).toEqual(["b"]);
    expect(filterItems(items, { kinds: [] })).toHaveLength(5);
  });
  it("summarize", () => {
    expect(summarize(items)).toEqual({ folders: 2, files: 3, bytes: 605 });
  });
});
