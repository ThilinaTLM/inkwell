// "Link details" inspector for the Shared links page (wireframe screen
// 15, right column). Every control autosaves; each save pushes an undo
// entry (toast "Undo" + ⌘Z). Label commits on blur / ↵.
//
// PUBLIC CONTRACT
//   <ShareDetailsPanel shares={Share[]} resolve={(s) => ShareTarget} onRevealTarget(s) />
//     – 0 selected: hint · 1: editor · n: bulk summary (revoke / extend)

import {
  Copy01Icon,
  Delete02Icon,
  FolderOpenIcon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useId, useState } from "react";
import { DetailsPanel } from "@/components/shell/DetailsPanel";
import { Button } from "@/components/ui/button";
import { ItemIcon } from "@/features/library/ItemTable";
import type { Share } from "@/lib/api/client";
import { shareUrl } from "@/lib/url";
import { cn } from "@/lib/utils";
import { AllowDownloadField } from "./fields/AllowDownloadField";
import { ExpiryChips, type ExpiryChoice } from "./fields/ExpiryChips";
import { LabelField } from "./fields/LabelField";
import { PermissionSegment } from "./fields/PermissionSegment";
import { copyShareLink } from "./ShareDialog";
import { extendShares, revokeShares, updateShareWithUndo } from "./shareActions";
import { expiryLabel, presetToExpiresAt, shareStatus } from "./shareStatus";
import type { ShareTarget } from "./useShareTargets";

const DAY = 86_400_000;

export function ShareDetailsPanel({
  selected,
  resolve,
  onRevealTarget,
}: {
  selected: Share[];
  resolve: (s: Share) => ShareTarget;
  onRevealTarget: (s: Share) => void;
}) {
  return (
    <DetailsPanel title="Link details">
      {selected.length === 0 ? (
        <p className="pt-2 text-xs text-muted-foreground">
          Select a link to edit its label, access and expiry.
        </p>
      ) : selected.length === 1 ? (
        <SingleLink
          key={selected[0].token}
          share={selected[0]}
          target={resolve(selected[0])}
          onRevealTarget={() => onRevealTarget(selected[0])}
        />
      ) : (
        <MultiLinks shares={selected} />
      )}
    </DetailsPanel>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3 border-t border-border pt-2.5">
      <h4 className="mb-2 text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
        {title}
      </h4>
      {children}
    </section>
  );
}

function SingleLink({
  share,
  target,
  onRevealTarget,
}: {
  share: Share;
  target: ShareTarget;
  onRevealTarget: () => void;
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState(share.label ?? "");
  const [custom, setCustom] = useState(false);
  const labelId = useId();
  const dlId = useId();
  const now = Date.now();
  const status = shareStatus(share, now);
  const url = shareUrl(share.token);

  // Follow external changes (undo, other tabs) unless the user is typing.
  useEffect(() => {
    if (document.activeElement?.id !== labelId) setLabel(share.label ?? "");
  }, [share.label, labelId]);

  const save = (patch: Parameters<typeof updateShareWithUndo>[2], msg?: string) =>
    void updateShareWithUndo(qc, share, patch, msg);

  function commitLabel() {
    const next = label.trim() || null;
    if (next === (share.label ?? null)) return;
    save({ label: next }, "Label saved");
  }

  const expiryValue: ExpiryChoice | null = custom
    ? "custom"
    : share.expiresAt === null
      ? "never"
      : null;

  return (
    <div className="flex flex-col">
      <div className="mt-1.5 flex items-center gap-2">
        <ItemIcon kind={target.kind} className="size-8" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{target.name}</div>
          <div className="truncate text-[11.5px] text-muted-foreground">
            {target.ref.type === "folder"
              ? `Folder${target.itemCount !== undefined ? ` · includes ${target.itemCount} items` : ""}`
              : target.location}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void copyShareLink(share.token)}
        title="Copy link"
        className="mt-3 flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-left font-mono text-[11.5px] text-muted-foreground outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <span className="min-w-0 flex-1 truncate">{url.replace(/^https?:\/\//, "")}</span>
        <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} className="size-3.5 shrink-0" />
      </button>

      <Section title="Label">
        <LabelField id={labelId} value={label} onChange={setLabel} onCommit={commitLabel} />
      </Section>

      <Section title="Access">
        <PermissionSegment
          value={share.permission}
          onChange={(p) => {
            if (p !== share.permission) {
              save(
                p === "write" ? { permission: p, allowDownload: true } : { permission: p },
                p === "write" ? "Link can now edit" : "Link is now view-only",
              );
            }
          }}
          lockedToRead={target.kind === "static-site"}
        />
      </Section>

      <Section title="Expires">
        <ExpiryChips
          value={expiryValue}
          allowCustom
          customAt={share.expiresAt}
          onChange={(id) => {
            if (id === "custom") {
              setCustom(true);
              return;
            }
            setCustom(false);
            save({ expiresAt: presetToExpiresAt(id, Date.now()) }, "Expiry updated");
          }}
          onCustomAt={(ms) => {
            if (ms > Date.now()) save({ expiresAt: ms }, "Expiry updated");
          }}
        />
        <p
          className={cn(
            "mt-1.5 text-[11.5px] text-muted-foreground",
            status === "expiring" && "text-chart-3",
            status === "expired" && "text-destructive",
          )}
        >
          {share.expiresAt === null ? (
            "Never expires."
          ) : (
            <>
              {status === "expired" ? "Expired" : "Expires"}{" "}
              {new Date(share.expiresAt).toLocaleString([], {
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              ({expiryLabel(share.expiresAt, now).toLowerCase()})
              {status !== "active" ? (
                <>
                  {" — "}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={() => void extendShares(qc, [share], 7 * DAY)}
                  >
                    extend 7 days?
                  </button>
                </>
              ) : null}
            </>
          )}
        </p>
      </Section>

      <Section title="Options">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={dlId} className="text-[13px]">
            Allow downloads
          </label>
          <AllowDownloadField
            id={dlId}
            permission={share.permission}
            value={share.allowDownload}
            onChange={(v) =>
              save({ allowDownload: v }, v ? "Downloads allowed" : "Downloads disabled")
            }
          />
        </div>
        <dl className="mt-2.5 grid grid-cols-[86px_1fr] gap-x-2 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Created</dt>
          <dd>{new Date(share.createdAt).toLocaleString()}</dd>
          <dt className="text-muted-foreground">Last opened</dt>
          <dd>
            {share.lastAccessedAt ? new Date(share.lastAccessedAt).toLocaleString() : "Never"}
          </dd>
        </dl>
      </Section>

      <Section title="Actions">
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={onRevealTarget} disabled={!target.exists}>
            <HugeiconsIcon icon={FolderOpenIcon} strokeWidth={2} />
            Open target
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(url, "_blank", "noopener")}
          >
            <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={2} />
            Open link
          </Button>
          <span className="flex-1" />
          <Button variant="destructive" size="sm" onClick={() => void revokeShares(qc, [share])}>
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            Revoke
          </Button>
        </div>
      </Section>
    </div>
  );
}

function MultiLinks({ shares }: { shares: Share[] }) {
  const qc = useQueryClient();
  return (
    <div className="flex flex-col">
      <p className="mt-1.5 font-semibold">{shares.length} links selected</p>
      <Section title="Extend expiry">
        <div className="flex flex-wrap gap-1">
          {[
            ["+1 day", DAY],
            ["+7 days", 7 * DAY],
            ["+30 days", 30 * DAY],
          ].map(([label, ms]) => (
            <Button
              key={label}
              variant="outline"
              size="sm"
              onClick={() => void extendShares(qc, shares, ms as number)}
            >
              {label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void extendShares(qc, shares, "never")}
          >
            Never expire
          </Button>
        </div>
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">
          Expired links are extended from now; links that never expire stay that way.
        </p>
      </Section>
      <Section title="Actions">
        <Button variant="destructive" size="sm" onClick={() => void revokeShares(qc, shares)}>
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          Revoke {shares.length} links
        </Button>
      </Section>
    </div>
  );
}
