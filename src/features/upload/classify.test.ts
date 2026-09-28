import { describe, expect, it } from "vitest";
import { classifyName, isJunkPath, MAX_UPLOAD_BYTES, planEntries, sniffMatches } from "./classify";
import type { DroppedEntry } from "./types";

function entry(relativePath: string, content = "x", size?: number): DroppedEntry {
  const name = relativePath.split("/").pop() ?? relativePath;
  const file = new File([content], name);
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return { file, relativePath };
}

describe("classifyName", () => {
  it.each([
    ["a.excalidraw", "excalidraw", undefined],
    ["A.EXCALIDRAW", "excalidraw", undefined],
    ["scene.json", "excalidraw", "excalidraw-json"],
    ["net.drawio", "drawio", undefined],
    ["net.drawio.xml", "drawio", "drawio-xml"],
    ["net.xml", "drawio", "drawio-xml"],
    ["notes.md", "notes", undefined],
    ["notes.markdown", "notes", undefined],
    ["notes.txt", "notes", undefined],
    ["site.zip", "static-site", undefined],
    ["page.html", "static-site", undefined],
    ["page.htm", "static-site", undefined],
    ["budget.xlsx", null, undefined],
    ["image.png", null, undefined],
    ["noext", null, undefined],
  ])("%s → %s", (name, kind, sniff) => {
    const c = classifyName(name);
    expect(c.kind).toBe(kind);
    expect(c.sniff).toBe(sniff);
  });

  it("marks site sources", () => {
    expect(classifyName("a.zip").site).toBe("zip");
    expect(classifyName("a.html").site).toBe("html");
  });
});

describe("sniffMatches", () => {
  it("detects excalidraw json", () => {
    expect(sniffMatches("excalidraw-json", '{"type":"excalidraw","elements":[]}')).toBe(true);
    expect(sniffMatches("excalidraw-json", '{"name":"package"}')).toBe(false);
    expect(sniffMatches("excalidraw-json", "[1,2]")).toBe(false);
    expect(sniffMatches("excalidraw-json", "not json")).toBe(false);
  });
  it("detects drawio xml", () => {
    expect(sniffMatches("drawio-xml", '<?xml version="1.0"?><mxfile host="x">')).toBe(true);
    expect(sniffMatches("drawio-xml", "<mxGraphModel dx='1'><root/></mxGraphModel>")).toBe(true);
    expect(sniffMatches("drawio-xml", "<rss><channel/></rss>")).toBe(false);
  });
});

describe("isJunkPath", () => {
  it("filters OS junk", () => {
    expect(isJunkPath("a/.DS_Store")).toBe(true);
    expect(isJunkPath("__MACOSX/a/b.md")).toBe(true);
    expect(isJunkPath("a/._b.md")).toBe(true);
    expect(isJunkPath("a/b.md")).toBe(false);
  });
});

describe("planEntries", () => {
  it("plans loose files by kind with names stripped of extensions", () => {
    const jobs = planEntries([entry("a.excalidraw"), entry("Retro.md"), entry("budget.xlsx")]);
    expect(jobs.map((j) => [j.kind, j.name, j.reason ?? null])).toEqual([
      ["excalidraw", "a", null],
      ["notes", "Retro", null],
      [null, "budget", "Unsupported type (.xlsx)"],
    ]);
  });

  it("rejects files over the size limit", () => {
    const [job] = planEntries([entry("big.md", "x", MAX_UPLOAD_BYTES + 1)]);
    expect(job.kind).toBe("notes");
    expect(job.reason).toMatch(/Too large/);
  });

  it("allows zips up to the site limit", () => {
    const [job] = planEntries([entry("site.zip", "x", MAX_UPLOAD_BYTES + 1)]);
    expect(job.reason).toBeUndefined();
    expect(job.site).toBe("zip");
  });

  it("uses content sniffing for .json / .xml", () => {
    const good = entry("scene.json");
    const bad = entry("pkg.json");
    const jobs = planEntries([good, bad], (e) => e.file === good.file);
    expect(jobs[0].kind).toBe("excalidraw");
    expect(jobs[1].kind).toBeNull();
    expect(jobs[1].reason).toMatch(/not an Excalidraw/);
  });

  it("turns a directory with top-level index.html into one site", () => {
    const jobs = planEntries([
      entry("marketing/index.html"),
      entry("marketing/css/app.css"),
      entry("marketing/img/logo.png"),
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      kind: "static-site",
      site: "dir",
      name: "marketing",
      label: "marketing/",
      dirPath: [],
    });
    expect(jobs[0].entries.map((e) => e.relativePath).sort()).toEqual([
      "css/app.css",
      "img/logo.png",
      "index.html",
    ]);
  });

  it("mirrors other directories as folders and finds nested sites", () => {
    const jobs = planEntries([
      entry("docs/readme.md"),
      entry("docs/sub/net.drawio"),
      entry("docs/site/index.html"),
      entry("docs/site/a.js"),
      entry("docs/.DS_Store"),
    ]);
    expect(jobs.map((j) => [j.kind, j.name, j.dirPath.join("/")])).toEqual([
      ["notes", "readme", "docs"],
      ["drawio", "net", "docs/sub"],
      ["static-site", "site", "docs"],
    ]);
  });

  it("does not treat a nested index.html as a site marker for the parent", () => {
    const jobs = planEntries([entry("top/x.md"), entry("top/inner/index.html")]);
    expect(jobs.map((j) => [j.kind, j.dirPath.join("/"), j.name])).toEqual([
      ["notes", "top", "x"],
      ["static-site", "top", "inner"],
    ]);
  });
});
