// Notes editor preferences — content-width and typeface, persisted
// per-browser in localStorage.
//
// These are presentation-only choices that don't belong in the saved
// blob (they're per-reader, not per-document — the same note may be
// read at "Wide" by one user and "Narrow" by another). Modeled after
// `useTheme`: a small context provider mounted near the app root, a
// hook for reading/writing, and a FOUC-safe initial read so the
// editor never paints with the wrong width/font and re-flows.
//
// Width presets mirror Notion's convention: a comfortable reading
// column ("narrow"), a roomier writing column ("wide"), and edge-to-
// edge ("full"). The font roster is curated for modern reading and
// writing surfaces — a sans default that doesn't feel system-default,
// a humanist alternative, two serifs (calligraphic and classical),
// and two monospaces (one ligature-rich, one neutral). All font CSS
// is **lazy-loaded** by `loadNotesFont` (./fontLoader.ts) so the app
// shell only ships the chrome typeface; the editor face is fetched on
// the first visit to a notes document.

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type NotesEditorWidth = "narrow" | "wide" | "full";
export type NotesEditorFont =
  | "inter"
  | "manrope"
  | "geist"
  | "lora"
  | "source-serif"
  | "jetbrains-mono";

export const NOTES_WIDTHS: ReadonlyArray<{ value: NotesEditorWidth; label: string }> = [
  { value: "narrow", label: "Narrow" },
  { value: "wide", label: "Wide" },
  { value: "full", label: "Full width" },
];

export interface NotesFontOption {
  value: NotesEditorFont;
  label: string;
  /** Short tag shown after the label — "Sans", "Serif", "Mono". */
  family: "Sans" | "Serif" | "Mono";
  /** CSS `font-family` stack applied via `--bn-font-family`. */
  stack: string;
}

export const NOTES_FONTS: ReadonlyArray<NotesFontOption> = [
  {
    value: "inter",
    label: "Inter",
    family: "Sans",
    stack: '"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  {
    value: "manrope",
    label: "Manrope",
    family: "Sans",
    stack: '"Manrope Variable", "Manrope", system-ui, sans-serif',
  },
  {
    value: "geist",
    label: "Geist",
    family: "Sans",
    stack: '"Geist Variable", "Geist", "Inter Variable", system-ui, sans-serif',
  },
  {
    value: "lora",
    label: "Lora",
    family: "Serif",
    stack: '"Lora Variable", "Lora", "Iowan Old Style", Georgia, serif',
  },
  {
    value: "source-serif",
    label: "Source Serif",
    family: "Serif",
    stack: '"Source Serif 4 Variable", "Source Serif 4", "Source Serif Pro", Georgia, serif',
  },
  {
    value: "jetbrains-mono",
    label: "JetBrains Mono",
    family: "Mono",
    stack:
      '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
];

const FONT_STACKS = new Map(NOTES_FONTS.map((f) => [f.value, f.stack]));

export function fontStack(value: NotesEditorFont): string {
  // Fall back to the first option (Inter, by definition the array's
  // canonical default) if a stale localStorage value is encountered.
  return FONT_STACKS.get(value) ?? FONT_STACKS.get("inter") ?? NOTES_FONTS[0].stack;
}

const WIDTH_KEY = "inkwell:notes:width";
const FONT_KEY = "inkwell:notes:font";

const DEFAULT_WIDTH: NotesEditorWidth = "narrow";
const DEFAULT_FONT: NotesEditorFont = "inter";

interface NotesPreferencesValue {
  width: NotesEditorWidth;
  font: NotesEditorFont;
  setWidth: (w: NotesEditorWidth) => void;
  setFont: (f: NotesEditorFont) => void;
}

const NotesPreferencesContext = createContext<NotesPreferencesValue | null>(null);

function readWidth(): NotesEditorWidth {
  try {
    const v = localStorage.getItem(WIDTH_KEY);
    if (v === "narrow" || v === "wide" || v === "full") return v;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_WIDTH;
}

function readFont(): NotesEditorFont {
  try {
    const v = localStorage.getItem(FONT_KEY);
    if (v && FONT_STACKS.has(v as NotesEditorFont)) return v as NotesEditorFont;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_FONT;
}

export function NotesPreferencesProvider({ children }: { children: ReactNode }) {
  const [width, setWidthState] = useState<NotesEditorWidth>(() => readWidth());
  const [font, setFontState] = useState<NotesEditorFont>(() => readFont());

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, width);
    } catch {
      /* ignore */
    }
  }, [width]);

  useEffect(() => {
    try {
      localStorage.setItem(FONT_KEY, font);
    } catch {
      /* ignore */
    }
  }, [font]);

  const setWidth = useCallback((w: NotesEditorWidth) => setWidthState(w), []);
  const setFont = useCallback((f: NotesEditorFont) => setFontState(f), []);

  const value = useMemo<NotesPreferencesValue>(
    () => ({ width, font, setWidth, setFont }),
    [width, font, setWidth, setFont],
  );

  return (
    <NotesPreferencesContext.Provider value={value}>{children}</NotesPreferencesContext.Provider>
  );
}

export function useNotesPreferences(): NotesPreferencesValue {
  const ctx = useContext(NotesPreferencesContext);
  if (!ctx) {
    // Allow the editor to mount outside a provider (e.g. share-token
    // landing pages) by falling back to defaults — read-only callers
    // don't need to mutate.
    return {
      width: DEFAULT_WIDTH,
      font: DEFAULT_FONT,
      setWidth: () => {},
      setFont: () => {},
    };
  }
  return ctx;
}

/** Tailwind class that maps a width preset onto the editor wrapper. */
export function widthMaxClass(w: NotesEditorWidth): string {
  switch (w) {
    case "narrow":
      // ~720px reading column, the writerly default.
      return "max-w-[45rem]";
    case "wide":
      // ~960px — closer to Notion's "wide" toggle.
      return "max-w-[60rem]";
    case "full":
      return "max-w-none";
  }
}
