// Barrel for the command system. See registry.ts / keymap.ts /
// useGlobalHotkeys.ts / CommandMenuItems.tsx / fuzzy.ts / signals.ts
// for the documented contracts.

export { CommandMenuItems, type CommandMenuItemsProps } from "./CommandMenuItems";
export { fuzzyFilter, fuzzyMatch, highlightSegments } from "./fuzzy";
export {
  findConflicts,
  formatBinding,
  formatBindingParts,
  formatKeys,
  getKeyOverrides,
  isMacPlatform,
  normalizeBinding,
  parseBinding,
  resetAllKeyOverrides,
  setKeyOverride,
  useKeyOverridesVersion,
} from "./keymap";
export {
  COMMAND_GROUP_LABELS,
  type Command,
  type CommandContext,
  type CommandGroup,
  commandLabel,
  getCommand,
  getCommandContext,
  getCommands,
  getEffectiveKeys,
  isCommandAvailable,
  registerCommands,
  runCommand,
  setCommandContext,
  useCommand,
  useCommandContext,
  useCommandList,
  useRegisterCommands,
  useRegistryVersion,
} from "./registry";
export { quickLookStore, requestQuickLook, useQuickLookRequest } from "./signals";
export { shouldIgnoreHotkeyTarget, useGlobalHotkeys } from "./useGlobalHotkeys";
