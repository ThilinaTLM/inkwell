// Client-side undo stack (max 20 entries).
//
// PUBLIC CONTRACT
//   interface UndoEntry { label: string; undo: () => Promise<void> }
//   pushUndo(entry): string                 – returns the entry id
//   undoLast(): Promise<boolean>            – pops + runs the newest entry (toast "Undone: …")
//   runUndo(id): Promise<boolean>           – runs a specific entry (used by toast buttons)
//   toastWithUndo(message, undo, opts?)     – sonner toast with an "Undo" action; also pushes
//                                             the entry so ⌘Z works. `opts.label` overrides the
//                                             stack label (defaults to `message`).
//   useUndoCount(): number
//   createUndoStack(limit)                  – pure stack factory (exported for tests)
//
// The `app.undo` command (mod+z) is registered in
// `src/features/actions/itemCommands.ts` and calls `undoLast()`.

import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { createStore, useStore } from "@/lib/store";

export interface UndoEntry {
  label: string;
  undo: () => Promise<void>;
}

interface StoredEntry extends UndoEntry {
  id: string;
}

export function createUndoStack(limit = 20) {
  const store = createStore<StoredEntry[]>([]);
  let seq = 0;
  return {
    store,
    push(entry: UndoEntry): string {
      const id = `u${++seq}`;
      store.set((s) => [...s, { ...entry, id }].slice(-limit));
      return id;
    },
    /** Removes and returns the newest entry. */
    pop(): StoredEntry | undefined {
      const s = store.get();
      const last = s[s.length - 1];
      if (last) store.set(s.slice(0, -1));
      return last;
    },
    /** Removes and returns the entry with `id`. */
    take(id: string): StoredEntry | undefined {
      const s = store.get();
      const e = s.find((x) => x.id === id);
      if (e) store.set(s.filter((x) => x.id !== id));
      return e;
    },
    size: () => store.get().length,
    clear: () => store.set([]),
  };
}

const stack = createUndoStack(20);

export function pushUndo(entry: UndoEntry): string {
  return stack.push(entry);
}

async function execute(entry: StoredEntry | undefined): Promise<boolean> {
  if (!entry) return false;
  try {
    await entry.undo();
    toast.success(`Undone: ${entry.label}`);
    return true;
  } catch (e) {
    toast.error(errorMessage(e, "could not undo"));
    return false;
  }
}

export function undoLast(): Promise<boolean> {
  const entry = stack.pop();
  if (!entry) {
    toast("Nothing to undo");
    return Promise.resolve(false);
  }
  return execute(entry);
}

export function runUndo(id: string): Promise<boolean> {
  return execute(stack.take(id));
}

export function toastWithUndo(
  message: string,
  undo: () => Promise<void>,
  opts: { label?: string; description?: string } = {},
): string {
  const id = pushUndo({ label: opts.label ?? message, undo });
  toast.success(message, {
    description: opts.description,
    action: {
      label: "Undo",
      onClick: () => {
        void runUndo(id);
      },
    },
  });
  return id;
}

export function useUndoCount(): number {
  return useStore(stack.store, (s) => s.length);
}
