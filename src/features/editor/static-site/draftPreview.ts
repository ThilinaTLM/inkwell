// Live draft preview: turn the unsaved buffer into a self-contained
// `srcdoc` for the sandboxed preview iframe.
//
//   • `<base href>` points at the signed site URL so every untouched
//     asset (images, fonts, unedited CSS/JS) still loads from the server.
//   • Edited / brand-new stylesheets and scripts that the page references
//     are inlined (a `srcdoc` cannot fetch a buffer that only exists in
//     memory).
//   • A tiny script keeps `#anchor` links working under `<base>`, and
//     reports the scroll offset so the next rebuild keeps the position.
//
// The iframe stays sandboxed WITHOUT `allow-same-origin`.

export const PREVIEW_MSG = "inkwell-preview-scroll";

/** Resolve a relative reference from `pagePath` to a bundle path, or
 *  null for absolute / external / data URLs. */
export function resolveAssetPath(pagePath: string, ref: string): string | null {
  const clean = ref.trim().split(/[?#]/)[0];
  if (!clean || clean.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(clean)) return null;
  const out = pagePath.split("/").slice(0, -1);
  for (const seg of clean.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(seg);
  }
  try {
    return out.map(decodeURIComponent).join("/");
  } catch {
    return out.join("/");
  }
}

export interface DraftOptions {
  html: string;
  pagePath: string;
  /** Absolute-ish URL (ending in `/`) of the page's folder on the server. */
  baseHref: string;
  /** Edited / new text files by bundle path. */
  overrides: Readonly<Record<string, string>>;
  scrollY?: number;
}

export function buildDraftHtml({
  html,
  pagePath,
  baseHref,
  overrides,
  scrollY = 0,
}: DraftOptions): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  for (const link of Array.from(doc.querySelectorAll("link[rel~='stylesheet'][href]"))) {
    const target = resolveAssetPath(pagePath, link.getAttribute("href") ?? "");
    if (target === null || overrides[target] === undefined) continue;
    const style = doc.createElement("style");
    style.textContent = overrides[target];
    const media = link.getAttribute("media");
    if (media) style.setAttribute("media", media);
    link.replaceWith(style);
  }
  for (const script of Array.from(doc.querySelectorAll("script[src]"))) {
    const target = resolveAssetPath(pagePath, script.getAttribute("src") ?? "");
    if (target === null || overrides[target] === undefined) continue;
    script.removeAttribute("src");
    script.textContent = overrides[target].replace(/<\/script/gi, "<\\/script");
  }

  for (const b of Array.from(doc.querySelectorAll("base"))) b.remove();
  const base = doc.createElement("base");
  base.setAttribute("href", baseHref);
  doc.head.insertBefore(base, doc.head.firstChild);

  const y = Number.isFinite(scrollY) ? Math.max(0, Math.round(scrollY)) : 0;
  const helper = doc.createElement("script");
  helper.textContent = `(function(){var Y=${y};
function go(){if(Y)scrollTo(0,Y);}
go();addEventListener("load",go);
addEventListener("scroll",function(){Y=0;parent.postMessage({t:"${PREVIEW_MSG}",y:scrollY},"*");},{passive:true});
document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href^="#"]');
if(!a)return;e.preventDefault();var id=decodeURIComponent(a.getAttribute("href").slice(1));
var el=id?document.getElementById(id):document.documentElement;if(el)el.scrollIntoView();});
})();`;
  (doc.body ?? doc.documentElement).appendChild(helper);

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
