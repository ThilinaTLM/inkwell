import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import { bracketMatching, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  dark: boolean;
  fontFamily: string;
  /** Syntax mode. Defaults to Markdown. */
  language?: "markdown" | "html" | "text";
  /** Accessible name of the text area. */
  ariaLabel?: string;
  /**
   * `"writing"`: a gutter-less, auto-height surface meant to live inside a
   * scrolling, centred column (Markdown source mode). `"code"` (default) keeps
   * the classic full-height editor with line numbers used for HTML files.
   */
  variant?: "code" | "writing";
  /** Receives the underlying view (for focus / scroll restoration). */
  onView?: (view: EditorView | null) => void;
}

function markdownHighlightStyle(dark: boolean) {
  const palette = dark
    ? {
        heading: "#f5f1eb",
        strong: "#fff8ef",
        accent: "#f3a15f",
        link: "#ff9a4d",
        url: "#79b8e8",
        code: "#a8cc8c",
        syntax: "#858b94",
        quote: "#b8b0a8",
        separator: "#626871",
        keyword: "#c9a0dc",
        number: "#e7c787",
      }
    : {
        heading: "#292524",
        strong: "#1c1917",
        accent: "#b45309",
        link: "#c2410c",
        url: "#2563a8",
        code: "#166534",
        syntax: "#78716c",
        quote: "#57534e",
        separator: "#a8a29e",
        keyword: "#7e22ce",
        number: "#9a3412",
      };

  return HighlightStyle.define([
    {
      tag: [tags.heading, tags.heading1, tags.heading2],
      color: palette.heading,
      fontWeight: "700",
    },
    {
      tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6],
      color: palette.heading,
      fontWeight: "650",
    },
    { tag: tags.strong, color: palette.strong, fontWeight: "700" },
    { tag: tags.emphasis, color: palette.accent, fontStyle: "italic" },
    {
      tag: tags.link,
      color: palette.link,
      textDecoration: "underline",
      textUnderlineOffset: "3px",
    },
    { tag: tags.url, color: palette.url },
    { tag: tags.monospace, color: palette.code },
    {
      tag: [tags.meta, tags.processingInstruction, tags.punctuation],
      color: palette.syntax,
    },
    { tag: tags.quote, color: palette.quote, fontStyle: "italic" },
    { tag: tags.contentSeparator, color: palette.separator },
    { tag: [tags.keyword, tags.typeName, tags.className], color: palette.keyword },
    { tag: [tags.number, tags.bool, tags.null], color: palette.number },
    { tag: [tags.string, tags.regexp], color: palette.code },
    { tag: tags.comment, color: palette.syntax, fontStyle: "italic" },
    // HTML / CSS / JS (single-file HTML artifacts)
    { tag: [tags.tagName, tags.angleBracket], color: palette.keyword },
    { tag: tags.attributeName, color: palette.number },
    { tag: tags.attributeValue, color: palette.code },
    { tag: [tags.propertyName, tags.function(tags.variableName)], color: palette.url },
  ]);
}

function writingTheme(dark: boolean, fontFamily: string) {
  return EditorView.theme(
    {
      "&": {
        color: "var(--foreground)",
        backgroundColor: "transparent",
        fontSize: "15px",
      },
      ".cm-scroller": { overflow: "visible", fontFamily, lineHeight: "1.8" },
      ".cm-content": { padding: "0 0 38vh", caretColor: "var(--primary)" },
      ".cm-line": { padding: "0" },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "color-mix(in srgb, var(--primary) 22%, transparent) !important",
      },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--primary)", borderLeftWidth: "2px" },
      "&.cm-focused": { outline: "none" },
      ".cm-placeholder": { color: "var(--faint)" },
    },
    { dark },
  );
}

function editorTheme(dark: boolean, fontFamily: string) {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        color: "var(--foreground)",
        backgroundColor: "var(--background)",
        fontSize: "14px",
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily,
        lineHeight: "1.65",
      },
      ".cm-content": { padding: "1.5rem 0", caretColor: "var(--foreground)" },
      ".cm-line": { padding: "0 1rem" },
      ".cm-gutters": {
        backgroundColor: "var(--background)",
        color: "var(--muted-foreground)",
        border: "none",
      },
      ".cm-activeLine, .cm-activeLineGutter": {
        backgroundColor: "color-mix(in srgb, var(--muted) 55%, transparent)",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: dark ? "#3b526d99" : "#b8d7f599",
      },
      ".cm-cursor": { borderLeftColor: "var(--foreground)" },
      "&.cm-focused": { outline: "none" },
    },
    { dark },
  );
}

export function CodeMirrorEditor({
  value,
  onChange,
  readOnly,
  dark,
  fontFamily,
  language = "markdown",
  ariaLabel,
  variant = "code",
  onView,
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const suppressChangeRef = useRef(false);
  const editable = useRef(new Compartment()).current;
  const theme = useRef(new Compartment()).current;
  const mountConfig = useRef({
    value,
    readOnly,
    dark,
    fontFamily,
    language,
    ariaLabel,
    variant,
  }).current;
  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: mountConfig.value,
      extensions: [
        ...(mountConfig.variant === "writing"
          ? []
          : [lineNumbers(), highlightActiveLineGutter(), highlightActiveLine()]),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        highlightSelectionMatches(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          "aria-label":
            mountConfig.ariaLabel ??
            (mountConfig.language === "html"
              ? "HTML source editor"
              : mountConfig.language === "text"
                ? "File contents"
                : "Markdown source editor"),
        }),
        ...(mountConfig.language === "html"
          ? [html()]
          : mountConfig.language === "text"
            ? []
            : [markdown()]),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        editable.of([
          EditorState.readOnly.of(mountConfig.readOnly),
          EditorView.editable.of(!mountConfig.readOnly),
        ]),
        theme.of([
          mountConfig.variant === "writing"
            ? writingTheme(mountConfig.dark, mountConfig.fontFamily)
            : editorTheme(mountConfig.dark, mountConfig.fontFamily),
          syntaxHighlighting(markdownHighlightStyle(mountConfig.dark), { fallback: true }),
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !suppressChangeRef.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    onViewRef.current?.(view);
    return () => {
      onViewRef.current?.(null);
      view.destroy();
      viewRef.current = null;
    };
    // The editor instance is intentionally created once. Compartments and
    // the value synchronization effects below handle changing props.
  }, [editable, mountConfig, theme]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editable.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [editable, readOnly]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: theme.reconfigure([
        variant === "writing" ? writingTheme(dark, fontFamily) : editorTheme(dark, fontFamily),
        syntaxHighlighting(markdownHighlightStyle(dark), { fallback: true }),
      ]),
    });
  }, [dark, fontFamily, theme, variant]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    suppressChangeRef.current = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    suppressChangeRef.current = false;
  }, [value]);

  return (
    <section
      ref={hostRef}
      className={variant === "writing" ? "markdown-source-surface" : "h-full min-h-0"}
      aria-label={
        ariaLabel ?? (language === "html" ? "HTML source editor" : "Markdown source editor")
      }
    />
  );
}
