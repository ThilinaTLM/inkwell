// Keep pure-logic tests independent of Node's experimental Web Storage global.
// Browser-facing modules already treat an absent localStorage as the non-DOM case.
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: undefined,
});
