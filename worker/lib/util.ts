// Tiny non-HTTP helpers shared across the worker.

export function now(): number {
  return Date.now();
}

// Exhaustiveness guard for discriminated unions. A `default` branch that
// returns `assertNever(value)` will fail TS compilation if a new variant
// is added to the union without a matching case.
export function assertNever(value: never): never {
  throw new Error(`unhandled variant: ${String(value)}`);
}
