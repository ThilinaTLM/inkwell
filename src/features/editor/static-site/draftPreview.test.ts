// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildDraftHtml, resolveAssetPath } from "./draftPreview";

describe("resolveAssetPath", () => {
  it("resolves relative refs against the page folder", () => {
    expect(resolveAssetPath("index.html", "styles.css")).toBe("styles.css");
    expect(resolveAssetPath("a/b.html", "../c/x.js?v=1")).toBe("c/x.js");
    expect(resolveAssetPath("a/b.html", "./x.js")).toBe("a/x.js");
  });
  it("ignores absolute and external refs", () => {
    expect(resolveAssetPath("index.html", "/x.css")).toBeNull();
    expect(resolveAssetPath("index.html", "https://x.test/a.css")).toBeNull();
    expect(resolveAssetPath("index.html", "../x.css")).toBeNull();
  });
});

describe("buildDraftHtml", () => {
  it("inlines edited css/js and adds a base href", () => {
    const out = buildDraftHtml({
      html: '<html><head><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="keep.css"></head><body><script src="app.js"></script></body></html>',
      pagePath: "index.html",
      baseHref: "http://x.test/sites/1/sig/",
      overrides: { "styles.css": "body{color:red}", "app.js": "a</script>b" },
    });
    expect(out).toContain("<style>body{color:red}</style>");
    expect(out).toContain('href="keep.css"');
    expect(out).toContain("a<\\/script>b");
    expect(out).toContain('<base href="http://x.test/sites/1/sig/">');
  });
});
