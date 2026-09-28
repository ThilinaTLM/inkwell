// Settings (wireframe screen 17) at /settings/:section?. A secondary nav
// (Account · Preferences · Workspace) and one pane of two-column setting
// rows per section. Every preference applies instantly.
//
// Sections: profile · security · appearance · explorer · shortcuts ·
// editors · tags · about. Unknown sections redirect to /settings.

import {
  GridViewIcon,
  HashtagIcon,
  InformationCircleIcon,
  KeyboardIcon,
  LockPasswordIcon,
  PaintBoardIcon,
  PencilEdit02Icon,
  Settings02Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type ReactNode, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { PageFrame, PageToolbar, StatusBar, ToolbarSearch } from "@/components/shell/page";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMe } from "@/data/auth";
import { cn } from "@/lib/utils";
import { AboutSection } from "./sections/AboutSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { EditorsSection } from "./sections/EditorsSection";
import { ExplorerSection } from "./sections/ExplorerSection";
import { ProfileSection } from "./sections/ProfileSection";
import { SecuritySection } from "./sections/SecuritySection";
import { ShortcutsSection } from "./sections/ShortcutsSection";
import { TagsSection } from "./sections/TagsSection";

type SectionId =
  | "profile"
  | "security"
  | "appearance"
  | "explorer"
  | "shortcuts"
  | "editors"
  | "tags"
  | "about";

interface SectionDef {
  id: SectionId;
  label: string;
  icon: IconSvgElement;
  title: string;
  description: string;
  searchable?: string;
}

const NAV: Array<{ heading: string; items: SectionDef[] }> = [
  {
    heading: "Account",
    items: [
      {
        id: "profile",
        label: "Profile",
        icon: UserCircleIcon,
        title: "Profile",
        description: "Who you are in this workspace.",
      },
      {
        id: "security",
        label: "Security",
        icon: LockPasswordIcon,
        title: "Security",
        description: "Password and sign-in.",
      },
    ],
  },
  {
    heading: "Preferences",
    items: [
      {
        id: "appearance",
        label: "Appearance",
        icon: PaintBoardIcon,
        title: "Appearance",
        description: "How Inkwell looks on this device. Changes apply instantly.",
      },
      {
        id: "explorer",
        label: "Explorer",
        icon: GridViewIcon,
        title: "Explorer",
        description: "How folders and files are shown and behave. Changes apply instantly.",
      },
      {
        id: "shortcuts",
        label: "Shortcuts",
        icon: KeyboardIcon,
        title: "Shortcuts",
        description: "Click a shortcut to rebind it. Stored on this device.",
        searchable: "Search commands or keys",
      },
      {
        id: "editors",
        label: "Editors",
        icon: PencilEdit02Icon,
        title: "Editors",
        description: "Per-editor defaults for draw.io and Notes.",
      },
    ],
  },
  {
    heading: "Workspace",
    items: [
      {
        id: "tags",
        label: "Tags",
        icon: HashtagIcon,
        title: "Tags",
        description: "Rename or delete tags across all your files and folders.",
        searchable: "Filter tags",
      },
      {
        id: "about",
        label: "About",
        icon: InformationCircleIcon,
        title: "About Inkwell",
        description: "Version and credits.",
      },
    ],
  },
];

const ALL = NAV.flatMap((g) => g.items);

export function SettingsPage() {
  const { section } = useParams<{ section?: string }>();
  const me = useMe();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const current = ALL.find((s) => s.id === (section ?? "profile"));
  if (!current) return <Navigate to="/settings" replace />;
  if (!me.data) return null;

  let body: ReactNode;
  switch (current.id) {
    case "profile":
      body = <ProfileSection user={me.data} />;
      break;
    case "security":
      body = <SecuritySection />;
      break;
    case "appearance":
      body = <AppearanceSection />;
      break;
    case "explorer":
      body = <ExplorerSection />;
      break;
    case "shortcuts":
      body = <ShortcutsSection query={q} />;
      break;
    case "editors":
      body = <EditorsSection />;
      break;
    case "tags":
      body = <TagsSection query={q} />;
      break;
    case "about":
      body = <AboutSection />;
      break;
  }

  return (
    <PageFrame>
      <PageToolbar
        icon={Settings02Icon}
        title="Settings"
        right={
          current.searchable ? (
            <ToolbarSearch
              value={q}
              onChange={setQ}
              placeholder={current.searchable}
              className="w-[240px]"
            />
          ) : null
        }
      />
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Settings sections"
          className="hidden w-[210px] shrink-0 overflow-y-auto border-r border-border px-2 py-3.5 md:block"
        >
          {NAV.map((g) => (
            <div key={g.heading} className="mb-2">
              <div className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {g.heading}
              </div>
              {g.items.map((s) => (
                <Link
                  key={s.id}
                  to={s.id === "profile" ? "/settings" : `/settings/${s.id}`}
                  onClick={() => setQ("")}
                  aria-current={s.id === current.id ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                    s.id === current.id &&
                      "bg-accent font-medium text-accent-foreground hover:bg-accent",
                  )}
                >
                  <HugeiconsIcon icon={s.icon} strokeWidth={1.8} className="size-[15px]" />
                  {s.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-7">
          {/* Mobile section picker */}
          <Select
            value={current.id}
            onValueChange={(value) => {
              const id = value as SectionId;
              navigate(id === "profile" ? "/settings" : `/settings/${id}`);
            }}
          >
            <SelectTrigger aria-label="Settings section" className="mb-4 w-full md:hidden">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mx-auto max-w-[760px]">
            <header className="mt-1 mb-[18px] flex flex-wrap items-end gap-x-3 gap-y-1">
              <h1 className="font-display text-[26px] leading-tight font-medium text-foreground">
                {current.title}
              </h1>
              <p className="text-[13px] text-muted-foreground">{current.description}</p>
            </header>
            {body}
          </div>
        </div>
      </div>
      <StatusBar left={<span>Settings · {current.label}</span>} />
    </PageFrame>
  );
}
