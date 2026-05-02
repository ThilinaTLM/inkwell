// Debounced value hook — returns the most recent `value` only after it
// has been stable for `delay` ms. Useful for "type-then-search" inputs
// where every keystroke would otherwise trigger a refetch.

import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
