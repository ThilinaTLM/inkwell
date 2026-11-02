// Mermaid previews for fenced ```mermaid blocks in the WYSIWYG editor.
// mermaid is dynamically imported, so it only costs bytes when used.

let counter = 0;

function readVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function renderMermaidPreview(source: string, apply: (value: string | null) => void) {
  const id = `inkwell-mermaid-${++counter}`;
  void import("mermaid")
    .then(async ({ default: mermaid }) => {
      const dark = document.documentElement.classList.contains("dark");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        suppressErrorRendering: true,
        fontFamily: '"Inter Variable", Inter, system-ui, sans-serif',
        themeVariables: {
          background: "transparent",
          primaryColor: readVar("--card", dark ? "#1f1c19" : "#fffdf8"),
          primaryTextColor: readVar("--foreground", dark ? "#ede6d8" : "#1e2330"),
          primaryBorderColor: readVar("--input", dark ? "#433c34" : "#d6cbb2"),
          lineColor: readVar("--muted-foreground", "#8f8873"),
          secondaryColor: readVar("--muted", dark ? "#2a2621" : "#efe8d8"),
          tertiaryColor: readVar("--background", dark ? "#171513" : "#f7f2e8"),
        },
      });
      const { svg } = await mermaid.render(id, source);
      apply(`<div class="inkwell-mermaid">${svg}</div>`);
    })
    .catch((reason: unknown) => {
      const msg = reason instanceof Error ? reason.message : "Invalid diagram";
      const safe = msg.replace(
        /[&<>]/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c,
      );
      apply(
        `<div class="inkwell-mermaid-error"><strong>Invalid Mermaid diagram</strong><span>${safe}</span></div>`,
      );
    });
}
