// Formatting actions for the Write-mode toolbar, wired to Milkdown commands.
// Everything here takes a Milkdown `Ctx` so the toolbar never touches
// ProseMirror directly except to read the current selection state.

import { toggleLinkCommand } from "@milkdown/kit/component/link-tooltip";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import {
  createCodeBlockCommand,
  insertHrCommand,
  listItemSchema,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBlockTypeCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { insertTableCommand, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";

export type FormatAction =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "link"
  | "bullet"
  | "ordered"
  | "task"
  | "quote"
  | "codeblock"
  | "table"
  | "divider";

export interface FormatState {
  /** 0 = paragraph / not a heading, else 1-6. */
  heading: number;
  active: Partial<Record<FormatAction, boolean>>;
}

export function runFormat(ctx: Ctx, action: FormatAction): void {
  const commands = ctx.get(commandsCtx);
  switch (action) {
    case "paragraph":
      commands.call(turnIntoTextCommand.key);
      break;
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(action.slice(1));
      const state = readFormatState(ctx);
      // Toggle: picking the active level turns the block back into text.
      if (state.heading === level) commands.call(turnIntoTextCommand.key);
      else commands.call(wrapInHeadingCommand.key, level);
      break;
    }
    case "bold":
      commands.call(toggleStrongCommand.key);
      break;
    case "italic":
      commands.call(toggleEmphasisCommand.key);
      break;
    case "strike":
      commands.call(toggleStrikethroughCommand.key);
      break;
    case "code":
      commands.call(toggleInlineCodeCommand.key);
      break;
    case "link":
      commands.call(toggleLinkCommand.key);
      break;
    case "bullet":
      commands.call(wrapInBulletListCommand.key);
      break;
    case "ordered":
      commands.call(wrapInOrderedListCommand.key);
      break;
    case "task":
      commands.call(wrapInBlockTypeCommand.key, {
        nodeType: listItemSchema.type(ctx),
        attrs: { checked: false },
      });
      break;
    case "quote":
      commands.call(wrapInBlockquoteCommand.key);
      break;
    case "codeblock":
      commands.call(createCodeBlockCommand.key);
      break;
    case "table":
      commands.call(insertTableCommand.key, { row: 3, col: 3 });
      break;
    case "divider":
      commands.call(insertHrCommand.key);
      break;
  }
  ctx.get(editorViewCtx).focus();
}

export function readFormatState(ctx: Ctx): FormatState {
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const { selection, doc, schema } = state;
  const { $from, from, to, empty } = selection;

  const hasMark = (name: string): boolean => {
    const type = schema.marks[name];
    if (!type) return false;
    if (empty) return Boolean(type.isInSet(state.storedMarks ?? $from.marks()));
    return doc.rangeHasMark(from, to, type);
  };

  let heading = 0;
  const ancestors = new Set<string>();
  let task = false;
  for (let d = $from.depth; d >= 0; d--) {
    const node = $from.node(d);
    ancestors.add(node.type.name);
    if (node.type.name === "heading") heading = Number(node.attrs.level) || 0;
    if (node.type.name === "list_item" && node.attrs.checked != null) task = true;
  }
  const inList = ancestors.has("list_item");
  const innermostList = (() => {
    for (let d = $from.depth; d >= 0; d--) {
      const name = $from.node(d).type.name;
      if (name === "bullet_list" || name === "ordered_list") return name;
    }
    return null;
  })();

  return {
    heading,
    active: {
      bold: hasMark("strong"),
      italic: hasMark("emphasis"),
      strike: hasMark("strike_through"),
      code: hasMark("inline_code"),
      link: hasMark("link"),
      bullet: inList && !task && innermostList === "bullet_list",
      ordered: inList && innermostList === "ordered_list",
      task,
      quote: ancestors.has("blockquote"),
      codeblock: ancestors.has("code_block"),
    },
  };
}
