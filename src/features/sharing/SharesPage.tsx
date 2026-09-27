// Shared links (wireframe screen 15): one dense, filterable table of every
// link the user owns. Toggle-chip filters (type / access / status incl.
// "Expiring soon" < 24 h and "Expired"), search, Group by none / target /
// access, hover row actions (copy · open · edit · revoke), multi-select
// bulk revoke / extend, a right-click menu with "Reveal target", and the
// autosaving details panel. `?token=` preselects a link and opens the panel.
//
// Page commands (registered while mounted, shown in menus and ⌘K):
//   share.edit (↵) · share.copy (⌘C) · share.open · share.reveal ·
//   share.extend7 · share.revoke (Delete, ⌘⌫)

import {
  ArrowDown01Icon,
  Clock01Icon,
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
  FolderOpenIcon,
  Link04Icon,
  LinkSquare02Icon,
  PlusSignIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FilterBar,
  FilterChip,
  PageFrame,
  PageToolbar,
  StatusBar,
  ToolbarSearch,
} from "@/components/shell/page";
import { setDetailsOpen } from "@/components/shell/shellStore";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAllShares } from "@/data/shares";
import { ensureItems } from "@/features/actions/itemCache";
import { useItemActions } from "@/features/actions/useItemActions";
import { fmtShortDate } from "@/features/library/helpers";
import { ItemIcon } from "@/features/library/ItemTable";
import {
  CheckTd,
  CheckTh,
  EmptyRow,
  GroupRow,
  ListRow,
  ListTable,
  PermBadge,
  RowActions,
  RowIconButton,
  Td,
  Th,
} from "@/features/library/ListTable";
import { SelectedCount, useToggleSort } from "@/features/library/parts";
import { useListSelection, useLocalSelState } from "@/features/library/useListSelection";
import type { Share } from "@/lib/api/client";
import { CommandMenuItems } from "@/lib/commands/CommandMenuItems";
import { type Command, useRegisterCommands } from "@/lib/commands/registry";
import { shareUrl } from "@/lib/url";
import { cn } from "@/lib/utils";
import { NewLinkPicker } from "./NewLinkPicker";
import { ShareDetailsPanel } from "./ShareDetailsPanel";
import { copyShareLink } from "./ShareDialog";
import { extendShares, revokeShares } from "./shareActions";
import {
  DEFAULT_SHARE_FILTERS,
  expiryLabel,
  filterShares,
  type ShareFilters,
  shareStatus,
} from "./shareStatus";
import { type ShareTarget, useShareTargets } from "./useShareTargets";

type GroupBy = "none" | "target" | "access";
type SortKey = "item" | "label" | "access" | "expires" | "created";

const DAY = 86_400_000;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const ROW_MENU_IDS = [
  "share.copy",
  "share.open",
  "share.edit",
  "share.reveal",
  "-",
  "share.extend7",
  "-",
  "share.revoke",
];

function Sep() {
  return <span aria-hidden className="mx-1 h-[18px] w-px shrink-0 bg-border" />;
}

export function SharesPage() {
  const qc = useQueryClient();
  const actions = useItemActions();
  const sharesQ = useAllShares();
  const { resolve } = useShareTargets();
  const [filters, setFilters] = useState<ShareFilters>(DEFAULT_SHARE_FILTERS);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [sort, onSort] = useToggleSort<SortKey>({ key: "created", dir: "desc" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const now = Date.now();

  const all = sharesQ.data ?? [];
  const setF = (patch: Partial<ShareFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const rows = useMemo(() => {
    const list = filterShares(sharesQ.data ?? [], filters, Date.now());
    const sign = sort.dir === "asc" ? 1 : -1;
    const targetName = (s: Share) => resolve(s).name;
    return list.sort((a, b) => {
      switch (sort.key) {
        case "item":
          return sign * collator.compare(targetName(a), targetName(b));
        case "label":
          return sign * collator.compare(a.label ?? "", b.label ?? "");
        case "access":
          return sign * a.permission.localeCompare(b.permission);
        case "expires":
          return (
            sign *
            ((a.expiresAt ?? Number.MAX_SAFE_INTEGER) - (b.expiresAt ?? Number.MAX_SAFE_INTEGER))
          );
        default:
          return sign * (a.createdAt - b.createdAt);
      }
    });
  }, [sharesQ.data, filters, sort, resolve]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: undefined as string | undefined, rows }];
    const map = new Map<string, { key: string; label: string; rows: Share[] }>();
    for (const s of rows) {
      const key = groupBy === "target" ? `${s.targetType}:${s.targetId}` : s.permission;
      const label =
        groupBy === "target"
          ? resolve(s).name
          : s.permission === "write"
            ? "Can edit"
            : "View only";
      const g = map.get(key) ?? { key, label, rows: [] };
      g.rows.push(s);
      map.set(key, g);
    }
    return [...map.values()];
  }, [rows, groupBy, resolve]);

  const order = useMemo(() => groups.flatMap((g) => g.rows.map((s) => s.token)), [groups]);
  const selection = useListSelection(order, useLocalSelState());
  const byToken = useMemo(() => new Map(all.map((s) => [s.token, s])), [all]);
  const selected = useMemo(
    () => selection.selectedKeys.map((t) => byToken.get(t)).filter((s): s is Share => !!s),
    [selection.selectedKeys, byToken],
  );

  // `?token=` → select that link (showing expired too if needed) and open the panel.
  const wanted = params.get("token");
  // biome-ignore lint/correctness/useExhaustiveDependencies: setF is a stable state updater wrapper
  useEffect(() => {
    if (!wanted || !sharesQ.data) return;
    const s = sharesQ.data.find((x) => x.token === wanted);
    if (s && shareStatus(s, Date.now()) === "expired") setF({ status: "all" });
    if (s && order.includes(wanted)) {
      selection.setOnly(wanted);
      setDetailsOpen(true);
      setParams({}, { replace: true });
    } else if (!s) setParams({}, { replace: true });
  }, [wanted, sharesQ.data, order, selection, setParams]);

  const reveal = async (s: Share) => {
    const ref = { type: s.targetType, id: s.targetId };
    await ensureItems(qc, [ref]);
    actions.reveal(ref);
  };
  const edit = (token: string) => {
    selection.setOnly(token);
    setDetailsOpen(true);
  };

  // Page commands read the latest selection through a ref.
  const selRef = useRef(selected);
  selRef.current = selected;
  const onShares = (route: string) => route === "/shares";
  const has = (route: string) => onShares(route) && selRef.current.length > 0;
  const one = (route: string) => onShares(route) && selRef.current.length === 1;
  // biome-ignore lint/correctness/useExhaustiveDependencies: page commands read live state through refs
  const commands = useMemo<Command[]>(
    () => [
      {
        id: "share.copy",
        label: "Copy link",
        icon: Copy01Icon,
        keys: ["mod+c"],
        group: "file",
        palette: false,
        when: (c) => has(c.route),
        disabledReason: () => (selRef.current.length > 1 ? "Copy one link at a time" : null),
        run: () => void copyShareLink(selRef.current[0].token),
      },
      {
        id: "share.open",
        label: "Open link in new tab",
        icon: LinkSquare02Icon,
        keys: ["mod+enter"],
        group: "file",
        palette: false,
        when: (c) => has(c.route),
        run: () => {
          for (const s of selRef.current.slice(0, 10))
            window.open(shareUrl(s.token), "_blank", "noopener");
        },
      },
      {
        id: "share.edit",
        label: "Edit link",
        icon: Edit02Icon,
        keys: ["enter"],
        group: "file",
        palette: false,
        when: (c) => one(c.route),
        run: () => edit(selRef.current[0].token),
      },
      {
        id: "share.reveal",
        label: "Reveal target in folder",
        icon: FolderOpenIcon,
        group: "file",
        palette: false,
        when: (c) => one(c.route),
        run: () => void reveal(selRef.current[0]),
      },
      {
        id: "share.extend7",
        label: (c) =>
          selRef.current.length > 1 && onShares(c.route)
            ? `Extend ${selRef.current.length} links by 7 days`
            : "Extend expiry by 7 days",
        icon: Clock01Icon,
        group: "organise",
        palette: false,
        when: (c) => has(c.route),
        run: () => void extendShares(qc, selRef.current, 7 * DAY),
      },
      {
        id: "share.revoke",
        label: () =>
          selRef.current.length > 1 ? `Revoke ${selRef.current.length} links…` : "Revoke link…",
        icon: Delete02Icon,
        keys: ["delete", "mod+backspace"],
        group: "organise",
        palette: false,
        destructive: true,
        when: (c) => has(c.route),
        run: () => void revokeShares(qc, selRef.current),
      },
      {
        id: "share.new",
        label: "New share link…",
        icon: PlusSignIcon,
        group: "file",
        when: (c) => onShares(c.route),
        run: () => setPickerOpen(true),
      },
    ],
    [qc],
  );
  useRegisterCommands(commands, [commands]);

  const expiringCount = all.filter((s) => shareStatus(s, now) === "expiring").length;
  const targetCount = new Set(all.map((s) => `${s.targetType}:${s.targetId}`)).size;
  const colSpan = 8;

  return (
    <PageFrame>
      <PageToolbar
        icon={Link04Icon}
        title="Shared links"
        right={
          <>
            <ToolbarSearch
              value={filters.q}
              onChange={(q) => setF({ q })}
              placeholder="Search label, file or folder"
              className="w-[240px]"
            />
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              New link
            </Button>
          </>
        }
      >
        <span className="truncate text-xs text-muted-foreground">
          {all.length} links · {targetCount} targets
        </span>
      </PageToolbar>

      <FilterBar>
        <span className="pr-0.5">Type</span>
        {(
          [
            ["all", "All"],
            ["file", "Files"],
            ["folder", "Folders"],
          ] as const
        ).map(([v, l]) => (
          <FilterChip key={v} active={filters.type === v} onClick={() => setF({ type: v })}>
            {l}
          </FilterChip>
        ))}
        <Sep />
        <span className="pr-0.5">Access</span>
        {(
          [
            ["all", "All"],
            ["read", "View"],
            ["write", "Edit"],
          ] as const
        ).map(([v, l]) => (
          <FilterChip key={v} active={filters.access === v} onClick={() => setF({ access: v })}>
            {l}
          </FilterChip>
        ))}
        <Sep />
        <span className="pr-0.5">Status</span>
        {(
          [
            ["all", "All"],
            ["active", "Active"],
            ["expiring", "Expiring soon"],
            ["expired", "Expired"],
          ] as const
        ).map(([v, l]) => (
          <FilterChip
            key={v}
            active={filters.status === v}
            onClick={() => setF({ status: filters.status === v && v !== "all" ? "all" : v })}
          >
            {l}
          </FilterChip>
        ))}
        <span className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            }
          >
            Group by: <b className="font-semibold text-foreground">{groupBy}</b>
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
              <DropdownMenuRadioItem value="none" closeOnClick>
                None
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="target" closeOnClick>
                Target
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="access" closeOnClick>
                Access
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </FilterBar>

      {selection.count > 1 ? (
        <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border bg-accent/40 px-3 text-xs">
          <b className="font-semibold text-accent-foreground">{selection.count} selected</b>
          <Sep />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} />
              Extend expiry…
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => void extendShares(qc, selected, DAY)}>
                +1 day
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void extendShares(qc, selected, 7 * DAY)}>
                +7 days
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void extendShares(qc, selected, 30 * DAY)}>
                +30 days
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void extendShares(qc, selected, "never")}>
                Never expire
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="destructive" size="sm" onClick={() => void revokeShares(qc, selected)}>
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            Revoke {selection.count} links
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={selection.clear}>
            Clear
          </Button>
        </div>
      ) : null}

      <ContextMenu>
        <ContextMenuTrigger className="flex min-h-0 flex-1 flex-col">
          <ListTable label="Shared links" selection={selection}>
            <thead>
              <tr>
                <CheckTh selection={selection} />
                <Th sortKey="item" sort={sort} onSort={onSort}>
                  Shared item
                </Th>
                <Th sortKey="label" sort={sort} onSort={onSort}>
                  Label
                </Th>
                <Th sortKey="access" sort={sort} onSort={onSort}>
                  Access
                </Th>
                <Th sortKey="expires" sort={sort} onSort={onSort}>
                  Expires
                </Th>
                <Th>Download</Th>
                <Th sortKey="created" sort={sort} onSort={onSort}>
                  Created
                </Th>
                <Th className="w-[128px]" />
              </tr>
            </thead>
            <tbody>
              {order.length === 0 ? (
                <EmptyRow colSpan={colSpan}>
                  {sharesQ.isPending
                    ? "Loading…"
                    : all.length === 0
                      ? "No share links yet — press New link."
                      : "No links match these filters."}
                </EmptyRow>
              ) : null}
              {groups.map((g) => (
                <Fragment key={g.key}>
                  {g.label ? (
                    <GroupRow colSpan={colSpan} label={g.label} count={g.rows.length} />
                  ) : null}
                  {g.rows.map((s) => (
                    <ShareRow
                      key={s.token}
                      share={s}
                      target={resolve(s)}
                      now={now}
                      selection={selection}
                      onEdit={() => edit(s.token)}
                      onRevoke={() => void revokeShares(qc, [s])}
                    />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </ListTable>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-56">
          {selection.count ? (
            <CommandMenuItems as="context" ids={ROW_MENU_IDS} />
          ) : (
            <CommandMenuItems as="context" ids={["share.new"]} />
          )}
        </ContextMenuContent>
      </ContextMenu>

      <StatusBar
        left={
          <>
            <span>
              <b className="font-semibold text-foreground">{rows.length}</b> of {all.length} links
            </span>
            {expiringCount ? (
              <b className="font-semibold text-chart-3">{expiringCount} expiring within 24 h</b>
            ) : null}
            <SelectedCount n={selection.count} />
          </>
        }
      />

      <ShareDetailsPanel
        selected={selected}
        resolve={resolve}
        onRevealTarget={(s) => void reveal(s)}
      />
      <NewLinkPicker open={pickerOpen} onOpenChange={setPickerOpen} />
    </PageFrame>
  );
}

function ShareRow({
  share: s,
  target,
  now,
  selection,
  onEdit,
  onRevoke,
}: {
  share: Share;
  target: ShareTarget;
  now: number;
  selection: ReturnType<typeof useListSelection>;
  onEdit: () => void;
  onRevoke: () => void;
}) {
  const status = shareStatus(s, now);
  return (
    <ListRow
      rowKey={s.token}
      selection={selection}
      dimmed={status === "expired"}
      onActivate={onEdit}
    >
      <CheckTd rowKey={s.token} selection={selection} />
      <Td primary className="max-w-[340px]">
        <span className="flex min-w-0 items-center gap-2">
          <ItemIcon kind={target.ref.type === "file" ? (target.kind ?? "excalidraw") : undefined} />
          <span className="truncate">{target.name}</span>
          <span className="truncate text-[11.5px] font-normal text-muted-foreground">
            {target.location}
          </span>
        </span>
      </Td>
      <Td className="max-w-[220px]" title={s.label ?? undefined}>
        {s.label || "—"}
      </Td>
      <Td>
        <PermBadge permission={s.permission} />
      </Td>
      <Td
        className={cn(status === "expiring" && "text-chart-3")}
        title={s.expiresAt ? new Date(s.expiresAt).toLocaleString() : undefined}
      >
        {expiryLabel(s.expiresAt, now)}
      </Td>
      <Td>
        {s.allowDownload || s.permission === "write" ? (
          <HugeiconsIcon
            icon={Tick02Icon}
            strokeWidth={2}
            aria-label="Allowed"
            className="size-3.5"
          />
        ) : (
          "—"
        )}
      </Td>
      <Td>{fmtShortDate(s.createdAt, now)}</Td>
      <Td className="py-0">
        <RowActions>
          <RowIconButton
            label="Copy link"
            icon={Copy01Icon}
            onClick={() => void copyShareLink(s.token)}
          />
          <RowIconButton
            label="Open link"
            icon={LinkSquare02Icon}
            onClick={() => window.open(shareUrl(s.token), "_blank", "noopener")}
          />
          <RowIconButton label="Edit link" icon={Edit02Icon} onClick={onEdit} />
          <RowIconButton label="Revoke link" icon={Delete02Icon} destructive onClick={onRevoke} />
        </RowActions>
      </Td>
    </ListRow>
  );
}
