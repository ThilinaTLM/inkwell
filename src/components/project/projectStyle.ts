// Project identity: curated icon keys + colour keys (see the folder
// metadata contract in docs/ux-audit/IMPLEMENTATION.md) mapped to Hugeicons
// and soft tile / text colour classes for light and dark themes.
//
// PUBLIC CONTRACT
//   PROJECT_ICON_KEYS / PROJECT_COLOR_KEYS     – ordered pickers
//   ProjectFields                              – optional project metadata on a folder
//   resolveProjectIcon(key) / resolveProjectColor(key)   – always return a valid entry
//   PROJECT_STATUS_META                        – label + classes per status
//   projectStatusOf(folder)                    – "active" when unset

import {
  Book02Icon,
  Briefcase01Icon,
  ChartLineData01Icon,
  CodeIcon,
  FlaskConicalIcon,
  Folder01Icon,
  GlobalIcon,
  PaintBrush01Icon,
  Presentation01Icon,
  Rocket01Icon,
  ServerStack01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export const PROJECT_ICONS = {
  folder: Folder01Icon,
  rocket: Rocket01Icon,
  book: Book02Icon,
  flask: FlaskConicalIcon,
  chart: ChartLineData01Icon,
  code: CodeIcon,
  presentation: Presentation01Icon,
  star: StarIcon,
  briefcase: Briefcase01Icon,
  palette: PaintBrush01Icon,
  server: ServerStack01Icon,
  globe: GlobalIcon,
} as const satisfies Record<string, IconSvgElement>;

export type ProjectIconKey = keyof typeof PROJECT_ICONS;
export const PROJECT_ICON_KEYS = Object.keys(PROJECT_ICONS) as ProjectIconKey[];

export interface ProjectColorStyle {
  label: string;
  /** Soft tile background. */
  tile: string;
  /** Icon / accent text colour on the tile. */
  text: string;
  /** Solid swatch (pickers). */
  swatch: string;
}

export const PROJECT_COLORS = {
  orange: {
    label: "Orange",
    tile: "bg-orange-100 dark:bg-orange-400/15",
    text: "text-orange-700 dark:text-orange-300",
    swatch: "bg-orange-500",
  },
  amber: {
    label: "Amber",
    tile: "bg-amber-100 dark:bg-amber-400/15",
    text: "text-amber-700 dark:text-amber-300",
    swatch: "bg-amber-500",
  },
  green: {
    label: "Green",
    tile: "bg-emerald-100 dark:bg-emerald-400/15",
    text: "text-emerald-700 dark:text-emerald-300",
    swatch: "bg-emerald-500",
  },
  teal: {
    label: "Teal",
    tile: "bg-teal-100 dark:bg-teal-400/15",
    text: "text-teal-700 dark:text-teal-300",
    swatch: "bg-teal-500",
  },
  blue: {
    label: "Blue",
    tile: "bg-sky-100 dark:bg-sky-400/15",
    text: "text-sky-700 dark:text-sky-300",
    swatch: "bg-sky-500",
  },
  indigo: {
    label: "Indigo",
    tile: "bg-indigo-100 dark:bg-indigo-400/15",
    text: "text-indigo-700 dark:text-indigo-300",
    swatch: "bg-indigo-500",
  },
  violet: {
    label: "Violet",
    tile: "bg-violet-100 dark:bg-violet-400/15",
    text: "text-violet-700 dark:text-violet-300",
    swatch: "bg-violet-500",
  },
  rose: {
    label: "Rose",
    tile: "bg-rose-100 dark:bg-rose-400/15",
    text: "text-rose-700 dark:text-rose-300",
    swatch: "bg-rose-500",
  },
  slate: {
    label: "Stone",
    tile: "bg-stone-200/70 dark:bg-stone-400/15",
    text: "text-stone-700 dark:text-stone-300",
    swatch: "bg-stone-500",
  },
} as const satisfies Record<string, ProjectColorStyle>;

export type ProjectColorKey = keyof typeof PROJECT_COLORS;
export const PROJECT_COLOR_KEYS = Object.keys(PROJECT_COLORS) as ProjectColorKey[];

export type ProjectStatus = "active" | "paused" | "done";

/** Optional project metadata (`FolderMeta` gains these fields; reading them
 *  through this type keeps older cached payloads valid). */
export type ProjectFields = Partial<{
  icon: string | null;
  color: string | null;
  description: string | null;
  status: ProjectStatus | null;
  pinnedAt: number | null;
}>;

export function resolveProjectIcon(key: string | null | undefined): IconSvgElement {
  return key && key in PROJECT_ICONS ? PROJECT_ICONS[key as ProjectIconKey] : PROJECT_ICONS.folder;
}

export function resolveProjectColor(key: string | null | undefined): ProjectColorStyle {
  return key && key in PROJECT_COLORS
    ? PROJECT_COLORS[key as ProjectColorKey]
    : PROJECT_COLORS.slate;
}

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-success-soft text-success" },
  paused: { label: "Paused", className: "bg-warning-soft text-warning" },
  done: { label: "Done", className: "bg-muted text-muted-foreground" },
};

export function projectStatusOf(folder: ProjectFields): ProjectStatus {
  const s = folder.status;
  return s === "paused" || s === "done" ? s : "active";
}
