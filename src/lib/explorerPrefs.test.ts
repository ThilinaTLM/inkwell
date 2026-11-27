import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

import { getCollectionLayout, setCollectionLayout } from "./explorerPrefs";

describe("collection layout pref", () => {
  beforeEach(() => store.clear());

  it("defaults to cards and remembers the choice", () => {
    expect(getCollectionLayout()).toBe("cards");
    setCollectionLayout("list");
    expect(getCollectionLayout()).toBe("list");
    expect(store.get("inkwell.explorer.collectionLayout")).toBe('"list"');
  });
});
