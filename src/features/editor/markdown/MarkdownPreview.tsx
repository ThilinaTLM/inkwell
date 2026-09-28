import "katex/dist/katex.min.css";

import { useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

interface MarkdownPreviewProps {
  source: string;
  dark: boolean;
  fontFamily: string;
}

function MermaidDiagram({ source, dark }: { source: string; dark: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const renderVersion = useRef(0);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const version = ++renderVersion.current;
    setSvg(null);
    setError(null);
    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          suppressErrorRendering: true,
          fontFamily: '"Inter Variable", Inter, system-ui, sans-serif',
          flowchart: { curve: "basis", htmlLabels: true },
          themeVariables: dark
            ? {
                background: "#18181b",
                primaryColor: "#202124",
                primaryTextColor: "#f4f4f5",
                primaryBorderColor: "#52525b",
                lineColor: "#a1a1aa",
                secondaryColor: "#27272a",
                tertiaryColor: "#18181b",
              }
            : {
                background: "#ffffff",
                primaryColor: "#ffffff",
                primaryTextColor: "#27272a",
                primaryBorderColor: "#cbd5e1",
                lineColor: "#64748b",
                secondaryColor: "#f8fafc",
                tertiaryColor: "#ffffff",
              },
        });
        const result = await mermaid.render(`inkwell-mermaid-${id}-${version}`, source);
        if (renderVersion.current === version) setSvg(result.svg);
      })
      .catch((reason: unknown) => {
        if (renderVersion.current !== version) return;
        setError(reason instanceof Error ? reason.message : "Unable to render Mermaid diagram");
      });
    return () => {
      renderVersion.current++;
    };
  }, [dark, id, source]);

  if (error) {
    return (
      <div className="markdown-mermaid-error" role="alert">
        <strong>Invalid Mermaid diagram</strong>
        <span>{error}</span>
      </div>
    );
  }
  if (!svg) return <div className="markdown-mermaid-loading">Rendering diagram…</div>;
  return (
    <div
      className="markdown-mermaid"
      // Mermaid produced this SVG under strict security mode. Normal Markdown
      // HTML is never passed through this path.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Mermaid output
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function MarkdownPreview({ source, dark, fontFamily }: MarkdownPreviewProps) {
  return (
    <div className="markdown-preview" style={{ fontFamily }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          a({ href, children, ...props }) {
            const external = Boolean(href && /^(?:https?:)?\/\//i.test(href));
            return (
              <a
                {...props}
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
              >
                {children}
              </a>
            );
          },
          code({ className, children, ...props }) {
            const match = /(?:^|\s)language-mermaid(?:\s|$)/.test(className ?? "");
            if (match) {
              return <MermaidDiagram source={String(children).replace(/\n$/, "")} dark={dark} />;
            }
            return (
              <code {...props} className={className}>
                {children}
              </code>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
