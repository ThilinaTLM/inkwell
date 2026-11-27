import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import { describe, expect, it } from "vitest";
import { fingerprintScene } from "./excalidrawScene";

const rect = (id: string, version: number) =>
  ({
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    angle: 0,
    strokeColor: "#000",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 1,
    version,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  }) as never;

const fp = (appState: Partial<AppState>, elements = [rect("a", 3)], files: BinaryFiles = {}) =>
  fingerprintScene(elements, appState, files);

describe("fingerprintScene", () => {
  it("ignores the scene name, so a renamed file is not 'edited'", () => {
    expect(fp({ name: "old" })).toBe(fp({ name: "new" }));
  });

  it("ignores pan/zoom/selection", () => {
    expect(fp({ scrollX: 1, zoom: { value: 1 } as never })).toBe(
      fp({ scrollX: 400, zoom: { value: 2 } as never }),
    );
  });

  it("changes when an element version changes", () => {
    expect(fp({}, [rect("a", 3)])).not.toBe(fp({}, [rect("a", 4)]));
  });
});
