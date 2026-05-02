// SceneCard — index card representation of a scene. The thumbnail is the
// "artwork", the name is in Excalifont, the meta line is in IBM Plex Sans,
// and tags appear as TapeChips. Hover lifts and squares the resting tilt.

import { HugeiconsIcon } from "@hugeicons/react";
import { Image01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { RoughBox } from "@/components/rough";
import { TapeChip } from "./TapeChip";
import { tiltFromId } from "./tilt";

export interface SceneCardProps {
  id: string;
  name: string;
  hasThumb: boolean;
  thumbUrl: string;
  folderName?: string | null;
  updatedAtLabel: string;
  tags: string[];
  href: string;
  /** Slot for the actions DropdownMenu trigger. */
  actions?: React.ReactNode;
  /** Click handler for the title (alternative to using `href`). */
  onOpen?: () => void;
}

export function SceneCard({
  id,
  name,
  hasThumb,
  thumbUrl,
  folderName,
  updatedAtLabel,
  tags,
  href,
  actions,
  onOpen,
}: SceneCardProps) {
  const tilt = tiltFromId(`scene:${id}`, 0.7);

  return (
    <li
      className="group/scene relative isolate transition-all duration-200 hover:-translate-y-1"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      {/* Card silhouette */}
      <RoughBox
        shape="card"
        seed={`scene-card:${id}`}
        stroke="var(--color-ink-soft)"
        strokeWidth={1.4}
        fill="var(--color-paper-elev)"
        fillStyle="solid"
        roughness={0.9}
        bowing={1}
        radius={10}
      />
      {/* Hover shadow */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-md opacity-0 shadow-[0_10px_30px_-10px_rgba(28,24,20,0.3)] transition-opacity duration-200 group-hover/scene:opacity-100"
      />

      <Link
        to={href}
        aria-label={`Open ${name}`}
        onClick={onOpen}
        className="relative block aspect-[4/3] w-full overflow-hidden rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {hasThumb ? (
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain transition-transform duration-300 group-hover/scene:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-muted/60">
            <HugeiconsIcon
              icon={Image01Icon}
              strokeWidth={1.4}
              className="size-12"
            />
          </div>
        )}
      </Link>

      <div className="relative flex items-start gap-2 px-3 pb-3 pt-2">
        <div className="min-w-0 flex-1">
          <Link
            to={href}
            onClick={onOpen}
            className={cn(
              "block w-full truncate text-left font-heading text-base text-ink",
              "transition-colors hover:text-vermillion"
            )}
            title={name}
          >
            {name}
          </Link>
          <div className="mt-0.5 flex items-center gap-1.5 font-hand text-sm text-ink-muted">
            {folderName && <span className="truncate">{folderName}</span>}
            {folderName && <span aria-hidden>·</span>}
            <span>{updatedAtLabel}</span>
          </div>
          {tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {tags.slice(0, 3).map((t) => (
                <TapeChip key={t} label={t} size="sm" asStatic active />
              ))}
              {tags.length > 3 && (
                <span className="font-hand text-xs text-ink-muted">
                  +{tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </li>
  );
}

/** Convenience icon for a "more actions" trigger. */
export function SceneCardActionsIcon() {
  return <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />;
}
