// @vitest-environment jsdom
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getMarkdown } from "@milkdown/kit/utils";
import { describe, expect, it } from "vitest";
import { configureMarkdownStyle } from "./milkdownStyle";

async function roundTrip(source: string): Promise<string> {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, source);
    })
    .config(configureMarkdownStyle)
    .use(commonmark)
    .use(gfm)
    .create();
  const out = editor.action(getMarkdown());
  await editor.destroy();
  return out;
}

describe("markdown round trip (Milkdown serialiser)", () => {
  const stable = [
    "# Title\n\nA paragraph with **bold**, *italic* and `code`.\n",
    "- one\n- two\n  - nested\n\n1. first\n2. second\n",
    "- [x] done\n- [ ] todo\n",
    "> quote\n\n---\n\nend\n",
    "```ts\nconst a = 1;\n```\n",
    // (Tables are padded by Crepe's own table feature, not covered by this headless preset.)
    "[link](https://example.com) and ![img](/a.png)\n",
  ];
  for (const doc of stable) {
    it(`is stable for ${JSON.stringify(doc.slice(0, 24))}`, async () => {
      expect(await roundTrip(doc)).toBe(doc);
    });
  }

  it("normalises bullets but keeps the author's emphasis markers", async () => {
    expect(await roundTrip("* a\n* b\n\n__bold__ and _it_\n")).toBe(
      "- a\n- b\n\n__bold__ and _it_\n",
    );
  });

  it("is idempotent after the first normalisation", async () => {
    const once = await roundTrip("* a\n+ b\n\nText  \nwith break\n");
    expect(await roundTrip(once)).toBe(once);
  });
});
