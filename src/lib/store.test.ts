import { describe, expect, it, vi } from "vitest";
import { createStore } from "./store";

describe("createStore", () => {
  it("notifies subscribers on change and skips identical values", () => {
    const s = createStore({ n: 0 });
    const l = vi.fn();
    const off = s.subscribe(l);
    s.set((p) => ({ n: p.n + 1 }));
    expect(s.get().n).toBe(1);
    const same = s.get();
    s.set(same);
    expect(l).toHaveBeenCalledTimes(1);
    off();
    s.set({ n: 5 });
    expect(l).toHaveBeenCalledTimes(1);
  });
});
