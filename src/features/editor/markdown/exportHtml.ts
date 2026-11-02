// Markdown → standalone HTML (and PDF via the browser's print dialog).
//
// Rendering reuses the preview pipeline's plugins (GFM, math/KaTeX,
// highlight.js classes); Mermaid fences are rendered to inline SVG
// (light theme) after the static markup is produced. The document
// carries its own CSS so it opens correctly anywhere; only the KaTeX
// stylesheet/fonts are linked from a CDN.

async function katexCssUrl(): Promise<string> {
  const { default: katex } = await import("katex");
  return `https://cdn.jsdelivr.net/npm/katex@${katex.version}/dist/katex.min.css`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#1f1b16;font:16px/1.7 "Inter",system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:46rem;margin:0 auto;padding:3rem 1.5rem 5rem}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin:2em 0 .6em;font-weight:650}
h1{font-size:2rem;margin-top:0}h2{font-size:1.5rem;border-bottom:1px solid #e7e0d4;padding-bottom:.3em}h3{font-size:1.2rem}
p,ul,ol,blockquote,pre,table{margin:0 0 1.1em}
a{color:#b84a14}
img,svg{max-width:100%;height:auto}
blockquote{margin-left:0;padding:.1em 1em;border-left:3px solid #e0c7b0;color:#5a5047}
code{font:.88em ui-monospace,SFMono-Regular,Menlo,monospace;background:#f4efe6;padding:.15em .35em;border-radius:5px}
pre{background:#f7f3ea;border:1px solid #e7e0d4;border-radius:10px;padding:1em;overflow:auto}
pre code{background:none;padding:0;font-size:.85em}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #e0d9cc;padding:.45em .7em;text-align:left}
th{background:#f7f3ea}
hr{border:0;border-top:1px solid #e7e0d4;margin:2em 0}
li>input[type=checkbox]{margin-right:.5em}
.hljs-comment,.hljs-quote{color:#8a8176;font-style:italic}
.hljs-keyword,.hljs-selector-tag,.hljs-literal{color:#7e22ce}
.hljs-string,.hljs-regexp,.hljs-addition{color:#166534}
.hljs-number,.hljs-attr,.hljs-variable,.hljs-template-variable{color:#9a3412}
.hljs-title,.hljs-section,.hljs-built_in,.hljs-type{color:#1d4ed8}
.hljs-deletion{color:#b91c1c}
.mermaid-block{text-align:center;margin:0 0 1.1em}
@media print{
  body{font-size:11pt}main{max-width:none;padding:0}
  pre,blockquote,table,img,svg{break-inside:avoid}
  h1,h2,h3{break-after:avoid}
  a{color:inherit}
}
`;

interface RenderedBody {
  html: string;
}

async function renderBody(source: string): Promise<RenderedBody> {
  const [{ createElement }, { renderToStaticMarkup }, md, gfm, math, katex, hl] = await Promise.all(
    [
      import("react"),
      import("react-dom/server"),
      import("react-markdown"),
      import("remark-gfm"),
      import("remark-math"),
      import("rehype-katex"),
      import("rehype-highlight"),
    ],
  );
  const ReactMarkdown = md.default;
  const mermaidSources: string[] = [];
  let html = renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [gfm.default, math.default],
        rehypePlugins: [katex.default, hl.default],
        components: {
          code({ className, children, ...props }: { className?: string; children?: unknown }) {
            if (/(?:^|\s)language-mermaid(?:\s|$)/.test(className ?? "")) {
              const idx = mermaidSources.push(String(children).replace(/\n$/, "")) - 1;
              return createElement("div", { className: "mermaid-block", "data-mermaid": idx });
            }
            return createElement("code", { ...props, className }, children as never);
          },
        },
      },
      source,
    ),
  );

  if (mermaidSources.length > 0) {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "default",
      suppressErrorRendering: true,
    });
    for (let i = 0; i < mermaidSources.length; i++) {
      let replacement: string;
      try {
        replacement = (await mermaid.render(`export-mermaid-${i}`, mermaidSources[i])).svg;
      } catch {
        replacement = `<pre><code>${escapeHtml(mermaidSources[i])}</code></pre>`;
      }
      html = html.replace(
        new RegExp(`<div class="mermaid-block" data-mermaid="${i}"></div>`),
        () => `<div class="mermaid-block">${replacement}</div>`,
      );
    }
  }
  return { html };
}

/** Full standalone HTML document for the given Markdown source. */
export async function markdownToHtmlDocument(source: string, title: string): Promise<string> {
  const [{ html }, katexCss] = await Promise.all([renderBody(source), katexCssUrl()]);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${katexCss}">
<style>${CSS}</style>
</head>
<body>
<main>
${html}
</main>
</body>
</html>
`;
}

/** Opens the browser print dialog (Save as PDF) for the rendered document. */
export async function printMarkdownAsPdf(source: string, title: string): Promise<void> {
  const doc = await markdownToHtmlDocument(source, title);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(iframe);
  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
    iframe.srcdoc = doc;
  });
  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    throw new Error("Could not open the print view");
  }
  const cleanup = () => window.setTimeout(() => iframe.remove(), 1000);
  win.addEventListener("afterprint", cleanup, { once: true });
  // Safety net if `afterprint` never fires.
  window.setTimeout(() => iframe.remove(), 120_000);
  win.focus();
  win.print();
}
