// Temporary library pages (Recent / Starred / Trash / Tag) until the
// pages workstream (WS-E) replaces them. They use the shared page
// chrome so the shell looks complete.

import { Clock01Icon, Delete02Icon, HashtagIcon, StarIcon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { useParams } from "react-router-dom";
import { PageBody, PageFrame, PageToolbar, StatusBar } from "@/components/shell/page";

function Placeholder({ icon, title, note }: { icon: IconSvgElement; title: string; note: string }) {
  return (
    <PageFrame>
      <PageToolbar icon={icon} title={title} />
      <PageBody>
        <div className="grid h-full place-items-center">
          <p className="font-hand text-2xl text-muted-foreground">{note}</p>
        </div>
      </PageBody>
      <StatusBar left={<span>{title}</span>} />
    </PageFrame>
  );
}

export function RecentPlaceholder() {
  return (
    <Placeholder
      icon={Clock01Icon}
      title="Recent"
      note="Recently edited files will show up here."
    />
  );
}

export function StarredPlaceholder() {
  return <Placeholder icon={StarIcon} title="Starred" note="Star files and folders with S." />;
}

export function TrashPlaceholder() {
  return (
    <Placeholder icon={Delete02Icon} title="Trash" note="Trashed items stay here for 30 days." />
  );
}

export function TagPlaceholder() {
  const { tag = "" } = useParams<{ tag: string }>();
  return <Placeholder icon={HashtagIcon} title={`#${tag}`} note={`Items tagged #${tag}.`} />;
}
