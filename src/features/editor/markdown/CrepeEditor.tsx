// WYSIWYG Markdown surface (Milkdown Crepe). Loaded lazily by MarkdownEditor.
//
// Storage stays plain Markdown. To avoid "surprise rewrites" the component
// serialises the freshly-parsed document once (the *baseline*) and only
// reports a change when the serialisation differs from that baseline. When the
// user edits back to the baseline, the original text is reported again so the
// file is not considered dirty and is never silently re-formatted.

import "@milkdown/crepe/theme/common/style.css";
import "katex/dist/katex.min.css";
import "./crepe.css";

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { useEffect, useRef, useState } from "react";
import { renderMermaidPreview } from "./mermaidPreview";
import { configureMarkdownStyle } from "./milkdownStyle";

export interface CrepeEditorProps {
  /** Markdown the editor opens with. Read once on mount (remount to reseed). */
  initialValue: string;
  readOnly: boolean;
  onChange: (markdown: string) => void;
  /** Resolve an image file to a URL stored in the Markdown. */
  onImageUpload?: (file: File) => Promise<string>;
  /** Fires once the document is rendered. */
  onReady?: (api: CrepeHandle) => void;
  ariaLabel?: string;
}

export interface CrepeHandle {
  /** Scroll position helper: the ProseMirror root element. */
  root: HTMLElement | null;
  focus: () => void;
}

// CodeMirror skin for fenced code blocks, driven by --ink-hl-* variables
// defined in crepe.css (so it follows light/dark with no re-creation).
const codeTheme = [
  EditorView.theme({
    "&": { backgroundColor: "transparent", color: "var(--foreground)" },
    ".cm-gutters": { display: "none" },
    ".cm-content": { caretColor: "var(--foreground)" },
    ".cm-activeLine": { backgroundColor: "transparent" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--primary) 22%, transparent) !important",
    },
  }),
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: [t.keyword, t.operatorKeyword, t.modifier], color: "var(--ink-hl-keyword)" },
      { tag: [t.string, t.regexp, t.special(t.string)], color: "var(--ink-hl-string)" },
      { tag: [t.number, t.bool, t.null, t.atom], color: "var(--ink-hl-number)" },
      {
        tag: [t.comment, t.lineComment, t.blockComment],
        color: "var(--ink-hl-comment)",
        fontStyle: "italic",
      },
      {
        tag: [t.function(t.variableName), t.function(t.propertyName), t.propertyName],
        color: "var(--ink-hl-fn)",
      },
      { tag: [t.typeName, t.className, t.tagName], color: "var(--ink-hl-type)" },
      { tag: [t.attributeName, t.definition(t.variableName)], color: "var(--ink-hl-attr)" },
      { tag: [t.punctuation, t.operator, t.bracket], color: "var(--ink-hl-punct)" },
      { tag: [t.heading], color: "var(--ink-hl-keyword)", fontWeight: "600" },
      { tag: [t.link, t.url], color: "var(--ink-hl-fn)" },
    ]),
  ),
];

export function CrepeEditor({
  initialValue,
  readOnly,
  onChange,
  onImageUpload,
  onReady,
  ariaLabel = "Markdown editor",
}: CrepeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const [ready, setReady] = useState(false);
  const seed = useRef(initialValue).current;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const cb = useRef({ onChange, onImageUpload, onReady });
  cb.current = { onChange, onImageUpload, onReady };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    const crepe = new Crepe({
      root: host,
      defaultValue: seed,
      features: { [CrepeFeature.AI]: false, [CrepeFeature.TopBar]: false },
      featureConfigs: {
        [CrepeFeature.Placeholder]: { text: "Write something, or press / for commands…" },
        [CrepeFeature.CodeMirror]: {
          languages,
          theme: codeTheme,
          renderPreview: (language, content, apply) => {
            if (language.toLowerCase() === "mermaid" && content.trim().length > 0) {
              renderMermaidPreview(content, apply);
              return undefined;
            }
            return null;
          },
        },
        [CrepeFeature.ImageBlock]: {
          onUpload: (file: File) => {
            const upload = cb.current.onImageUpload;
            return upload ? upload(file) : fileToDataUrl(file);
          },
        },
      },
    });
    crepeRef.current = crepe;
    crepe.editor.config(configureMarkdownStyle);

    let baseline = "";
    crepe.on((api) => {
      api.markdownUpdated((_ctx, markdown) => {
        if (disposed || readOnlyRef.current) return;
        cb.current.onChange(markdown === baseline ? seed : markdown);
      });
    });

    void crepe
      .create()
      .then(() => {
        if (disposed) return;
        baseline = crepe.getMarkdown();
        crepe.setReadonly(readOnlyRef.current);
        const view = crepe.editor.ctx.get(editorViewCtx);
        view.dom.setAttribute("aria-label", ariaLabel);
        view.dom.setAttribute("spellcheck", "true");
        setReady(true);
        cb.current.onReady?.({
          root: host.querySelector<HTMLElement>(".ProseMirror"),
          focus: () => view.focus(),
        });
      })
      .catch((reason: unknown) => {
        console.error("Crepe failed to start", reason);
      });

    return () => {
      disposed = true;
      crepeRef.current = null;
      void crepe.destroy();
    };
  }, [seed, ariaLabel]);

  useEffect(() => {
    if (ready) crepeRef.current?.setReadonly(readOnly);
  }, [readOnly, ready]);

  return (
    <div
      ref={hostRef}
      className="inkwell-crepe"
      data-ready={ready ? "true" : "false"}
      data-readonly={readOnly ? "true" : "false"}
    />
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

export default CrepeEditor;
