import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";

/**
 * Serialisation style. Chosen to match what people (and most tools) write by
 * hand, so the first edit of an existing note rewrites as little as possible:
 * `-` bullets, `*emphasis*`, `**strong**`, backtick fences, `---` rules.
 */
export const MARKDOWN_STRINGIFY_STYLE = {
  bullet: "-",
  bulletOther: "*",
  emphasis: "*",
  strong: "*",
  fence: "`",
  rule: "-",
  listItemIndent: "one",
  incrementListMarker: true,
} as const;

export function configureMarkdownStyle(ctx: Ctx) {
  ctx.update(remarkStringifyOptionsCtx, (prev) => ({ ...prev, ...MARKDOWN_STRINGIFY_STYLE }));
}
