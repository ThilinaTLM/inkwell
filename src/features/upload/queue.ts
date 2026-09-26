// Upload queue: an external store of rows plus a small scheduler.
//
// Each `uploadEntries` call is a batch (one toast when it settles). Jobs
// run with concurrency 3 through queued → creating → writing →
// thumbnail → done | error | skipped, pausing in `conflict` when the
// name already exists in the target folder and no default applies.
//
// Non-serialisable runtime data (File objects, prepared content) lives
// in side maps keyed by job id; the store only holds plain rows so the
// tray can render them directly.

import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidations } from "@/data/invalidations";
import {
  ApiError,
  type FileKind,
  type FileMeta,
  type FolderMeta,
  files as filesApi,
  folders as foldersApi,
} from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
import { createStore } from "@/lib/store";
import { classifyEntries } from "./classify";
import { sha256Hex } from "./excalidraw";
import { nameKey, uniqueName } from "./naming";
import {
  type CreatedFile,
  createForJob,
  hasClientThumb,
  type Prepared,
  prepareJob,
  UploadError,
  writeContent,
  writeThumb,
} from "./pipeline";
import type { ConflictChoice, DroppedEntry, PlannedJob, UploadStage } from "./types";

export const CONCURRENCY = 3;
export const CONFLICT_PREF_KEY = "inkwell.explorer.uploadConflict";

export interface UploadJob {
  id: string;
  batchId: string;
  /** Original file / directory label. */
  label: string;
  /** Name the file gets (changes after "Keep both"). */
  name: string;
  kind: FileKind | null;
  stage: UploadStage;
  /** 0..1, per stage (plan: no per-byte progress). */
  progress: number;
  /** Secondary text: destination sub-path, "38 files"… */
  detail?: string;
  /** Error / skip reason / note. */
  message?: string;
  unsupported?: boolean;
  conflict?: { canReplace: boolean };
  fileId?: string;
  /** Whether cancel still has an effect (no file row created yet). */
  cancellable: boolean;
}

export interface UploadState {
  jobs: UploadJob[];
  open: boolean;
  collapsed: boolean;
  /** "Apply to all" choice for the current session. */
  applyAll: ConflictChoice | null;
}

export const uploadStore = createStore<UploadState>({
  jobs: [],
  open: false,
  collapsed: false,
  applyAll: null,
});

interface JobRuntime {
  plan: PlannedJob;
  resolution?: ConflictChoice;
  cancelled: boolean;
  folderId?: string | null;
  /** Name reserved in the folder index (released on failure). */
  reserved?: string;
  replaceTarget?: FileMeta;
  prepared?: Prepared;
  created?: CreatedFile;
  written?: boolean;
}

interface Batch {
  id: string;
  folderId: string | null;
  targetName: Promise<string>;
  toasted: boolean;
}

const runtimes = new Map<string, JobRuntime>();
const batches = new Map<string, Batch>();
const identities = new Map<string, string>(); // job id → dedupe identity
let running = 0;
let seq = 0;
let queryClient: QueryClient | null = null;

const TERMINAL: ReadonlySet<UploadStage> = new Set(["done", "error", "skipped"]);
const ACTIVE: ReadonlySet<UploadStage> = new Set([
  "queued",
  "creating",
  "writing",
  "thumbnail",
  "conflict",
]);

export function isActiveStage(stage: UploadStage): boolean {
  return ACTIVE.has(stage);
}

/** The shell's React tree hands us its QueryClient (tray mount). */
export function bindQueryClient(qc: QueryClient): void {
  queryClient = qc;
}

// ─── Row helpers ──────────────────────────────────────────────────────

function patchJob(id: string, patch: Partial<UploadJob>): void {
  uploadStore.set((s) => ({
    ...s,
    jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
  }));
}

function getJob(id: string): UploadJob | undefined {
  return uploadStore.get().jobs.find((j) => j.id === id);
}

const STAGE_PROGRESS: Record<UploadStage, number> = {
  queued: 0,
  conflict: 0,
  creating: 0.2,
  writing: 0.55,
  thumbnail: 0.85,
  done: 1,
  error: 0,
  skipped: 0,
};

function setStage(id: string, stage: UploadStage, patch: Partial<UploadJob> = {}): void {
  patchJob(id, { stage, progress: STAGE_PROGRESS[stage], ...patch });
}

// ─── Session caches (folder listings, created folders) ───────────────
// Reset whenever the queue goes idle, so a later upload sees fresh data.

interface FolderIndex {
  /** name key → existing file, or `null` for a name reserved by an
   *  in-flight job of this session. */
  byName: Map<string, FileMeta | null>;
}

let folderList: Promise<FolderMeta[]> | null = null;
const folderIndexes = new Map<string, Promise<FolderIndex>>();
const folderPaths = new Map<string, Promise<string>>();
let foldersCreated = false;

function resetSession(): void {
  folderList = null;
  folderIndexes.clear();
  folderPaths.clear();
  uploadStore.set((s) => (s.applyAll ? { ...s, applyAll: null } : s));
}

function getFolders(): Promise<FolderMeta[]> {
  if (!folderList) {
    folderList = foldersApi.list().catch((e) => {
      folderList = null;
      throw e;
    });
  }
  return folderList;
}

const folderKey = (id: string | null) => id ?? "root";

function getIndex(folderId: string | null): Promise<FolderIndex> {
  const key = folderKey(folderId);
  let p = folderIndexes.get(key);
  if (!p) {
    p = filesApi.list({ folderId: key }).then((list) => {
      const byName = new Map<string, FileMeta | null>();
      for (const f of list) if (f.folderId === folderId) byName.set(nameKey(f.name), f);
      return { byName };
    });
    p.catch(() => folderIndexes.delete(key));
    folderIndexes.set(key, p);
  }
  return p;
}

/** Resolve (creating as needed) `base/dirPath…`; reuses an existing
 *  same-named child folder instead of duplicating it. */
async function ensureFolderPath(base: string | null, dirPath: string[]): Promise<string | null> {
  let parent = base;
  for (const seg of dirPath) {
    const name = seg.trim().slice(0, 200) || "Untitled folder";
    const key = `${folderKey(parent)}/${nameKey(name)}`;
    let p = folderPaths.get(key);
    if (!p) {
      const parentId = parent;
      p = (async () => {
        const all = await getFolders();
        const hit = all.find((f) => f.parentId === parentId && nameKey(f.name) === nameKey(name));
        if (hit) return hit.id;
        const created = await foldersApi.create({ name, parentId });
        foldersCreated = true;
        // A brand-new folder has no files: skip its listing request.
        folderIndexes.set(created.id, Promise.resolve({ byName: new Map() }));
        scheduleInvalidate();
        return created.id;
      })();
      p.catch(() => folderPaths.delete(key));
      folderPaths.set(key, p);
    }
    parent = await p;
  }
  return parent;
}

// ─── Invalidation + summary toast ─────────────────────────────────────

let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleInvalidate(): void {
  if (invalidateTimer) return;
  invalidateTimer = setTimeout(() => {
    invalidateTimer = null;
    if (!queryClient) return;
    invalidations.fileMutated(queryClient);
    if (foldersCreated) invalidations.folderMutated(queryClient);
    foldersCreated = false;
  }, 250);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

async function maybeFinishBatch(batchId: string): Promise<void> {
  const batch = batches.get(batchId);
  if (!batch || batch.toasted) return;
  const jobs = uploadStore.get().jobs.filter((j) => j.batchId === batchId);
  if (jobs.length === 0 || !jobs.every((j) => TERMINAL.has(j.stage))) return;
  batch.toasted = true;

  const done = jobs.filter((j) => j.stage === "done").length;
  const unsupported = jobs.filter((j) => j.unsupported).length;
  const failed = jobs.filter((j) => j.stage === "error").length;
  const skipped = jobs.filter((j) => j.stage === "skipped" && !j.unsupported).length;
  const target = await batch.targetName.catch(() => "folder");

  const extra = [
    unsupported ? `${unsupported} unsupported` : null,
    failed ? `${failed} failed` : null,
    skipped ? `${skipped} skipped` : null,
  ].filter(Boolean);
  const head = done > 0 ? `Uploaded ${plural(done, "file")} to ${target}` : "Nothing uploaded";
  const msg = [head, ...extra].join(" · ");
  if (done > 0 && extra.length === 0) toast.success(msg);
  else if (done === 0 && failed > 0) toast.error(msg);
  else toast.warning(msg);
}

function afterSettle(job: UploadJob | undefined): void {
  if (job) void maybeFinishBatch(job.batchId);
  const anyActive = uploadStore.get().jobs.some((j) => ACTIVE.has(j.stage));
  if (!anyActive && running === 0) resetSession();
}

// ─── Scheduler ────────────────────────────────────────────────────────

function pump(): void {
  while (running < CONCURRENCY) {
    const next = uploadStore.get().jobs.find((j) => j.stage === "queued");
    if (!next) return;
    running++;
    // Claim synchronously so the loop doesn't pick it twice.
    setStage(next.id, "creating");
    void runJob(next.id).finally(() => {
      running--;
      afterSettle(getJob(next.id));
      pump();
    });
  }
}

class Cancelled extends Error {}

function readConflictPref(): ConflictChoice | null {
  try {
    // Tolerate a JSON-encoded string value too.
    const v = localStorage.getItem(CONFLICT_PREF_KEY)?.replace(/^"|"$/g, "");
    if (v === "keepBoth" || v === "replace" || v === "skip") return v;
  } catch {
    /* storage unavailable */
  }
  return null;
}

async function runJob(id: string): Promise<void> {
  const rt = runtimes.get(id);
  const job = getJob(id);
  if (!rt || !job) return;
  const checkCancel = () => {
    if (rt.cancelled) throw new Cancelled();
  };

  try {
    // 1. Resume after a failed write: the file row already exists.
    if (!rt.created && !rt.replaceTarget) {
      checkCancel();
      if (rt.folderId === undefined) {
        const batch = batches.get(job.batchId);
        rt.folderId = await ensureFolderPath(batch?.folderId ?? null, rt.plan.dirPath);
      }
      checkCancel();
      rt.prepared ??= await prepareJob(rt.plan);
      checkCancel();

      const index = await getIndex(rt.folderId);
      if (!rt.reserved) {
        const key = nameKey(job.name);
        if (index.byName.has(key)) {
          const choice = rt.resolution ?? uploadStore.get().applyAll ?? readConflictPref();
          const existing = index.byName.get(key) ?? null;
          const canReplace = !!existing && existing.kind === job.kind;
          if (!choice) {
            setStage(id, "conflict", {
              message: "Name already exists",
              conflict: { canReplace },
            });
            return;
          }
          rt.resolution = undefined;
          if (choice === "skip") {
            setStage(id, "skipped", { message: "Skipped (name exists)", conflict: undefined });
            return;
          }
          if (choice === "replace" && canReplace && existing) {
            rt.replaceTarget = existing;
          } else {
            const next = uniqueName(job.name, namesOf(index));
            index.byName.set(nameKey(next), null);
            rt.reserved = next;
            patchJob(id, {
              name: next,
              conflict: undefined,
              message:
                choice === "replace"
                  ? `Kept both as “${next}” (existing item can't be replaced)`
                  : `Saved as “${next}”`,
            });
          }
        } else {
          index.byName.set(key, null);
          rt.reserved = job.name;
        }
      }
      patchJob(id, { conflict: undefined });
      checkCancel();

      if (!rt.replaceTarget) {
        setStage(id, "creating");
        rt.created = await createForJob(rt.prepared, rt.reserved ?? job.name, rt.folderId);
        rt.written = rt.created.written;
        index.byName.set(nameKey(rt.created.name), rt.created.meta);
        patchJob(id, { fileId: rt.created.id, cancellable: false, name: rt.created.name });
        scheduleInvalidate();
      }
    }

    rt.prepared ??= await prepareJob(rt.plan);
    const prepared = rt.prepared;

    // 2. Write.
    if (!rt.written) {
      const target = rt.replaceTarget ?? rt.created;
      if (!target) throw new UploadError("Nothing to write to");
      patchJob(id, { cancellable: false, fileId: target.id });
      setStage(id, "writing");
      const meta = await writeContent(prepared, target);
      rt.written = true;
      if (rt.created) rt.created = { ...rt.created, version: meta.version, meta };
      scheduleInvalidate();
    }

    // 3. Thumbnail (best-effort).
    const fileId = rt.created?.id ?? rt.replaceTarget?.id;
    if (fileId && job.kind && hasClientThumb(job.kind)) {
      setStage(id, "thumbnail");
      try {
        await writeThumb(prepared, fileId);
        scheduleInvalidate();
      } catch {
        /* the placeholder glyph stays */
      }
    }

    setStage(id, "done", {
      message: rt.replaceTarget ? "Replaced" : getJob(id)?.message,
      conflict: undefined,
    });
    rt.prepared = undefined; // free memory
  } catch (err) {
    if (err instanceof Cancelled) {
      releaseReservation(rt);
      setStage(id, "skipped", { message: "Cancelled", cancellable: false });
      return;
    }
    if (!rt.created) releaseReservation(rt);
    if (err instanceof ApiError && err.status === 409 && rt.replaceTarget) {
      // The listing was stale; a retry refetches it.
      folderIndexes.delete(folderKey(rt.folderId ?? null));
      rt.replaceTarget = undefined;
      rt.reserved = undefined;
    }
    // Invalid content can never succeed: don't keep the parsed data.
    if (err instanceof UploadError) rt.prepared = undefined;
    setStage(id, "error", {
      message: errorMessage(err, "Upload failed"),
      cancellable: !rt.created,
    });
  }
}

function namesOf(index: FolderIndex): string[] {
  const out: string[] = [];
  for (const [k, v] of index.byName) out.push(v ? v.name : k);
  return out;
}

function releaseReservation(rt: JobRuntime): void {
  if (!rt.reserved || rt.created) return;
  const key = nameKey(rt.reserved);
  const folderId = rt.folderId;
  rt.reserved = undefined;
  if (folderId === undefined) return;
  void folderIndexes.get(folderKey(folderId))?.then((idx) => {
    if (idx.byName.get(key) === null) idx.byName.delete(key);
  });
}

// ─── Public actions ───────────────────────────────────────────────────

async function identityOf(plan: PlannedJob, folderId: string | null): Promise<string> {
  const files = plan.entries;
  const f = files[0]?.file;
  const base = `${folderKey(folderId)}|${plan.dirPath.join("/")}|${plan.label}|${files.length}`;
  if (!f || files.length !== 1) return `${base}|${files.reduce((n, e) => n + e.file.size, 0)}`;
  try {
    return `${base}|${(await sha256Hex(await f.arrayBuffer())) ?? `${f.size}:${f.lastModified}`}`;
  } catch {
    return `${base}|${f.size}:${f.lastModified}`;
  }
}

function describe(plan: PlannedJob): string | undefined {
  const parts: string[] = [];
  if (plan.site === "dir") parts.push(plural(plan.entries.length, "file"));
  if (plan.dirPath.length > 0) parts.push(`in ${plan.dirPath.join("/")}`);
  return parts.length ? parts.join(" · ") : undefined;
}

/** Enqueue dropped / picked entries for upload into `folderId`
 *  (`null` = root). Fire-and-forget; progress shows in the tray. */
export function uploadEntries(entries: DroppedEntry[], folderId: string | null): void {
  if (entries.length === 0) return;
  void enqueue(entries, folderId).catch((err) => {
    toast.error(errorMessage(err, "Could not start the upload"));
  });
}

async function enqueue(entries: DroppedEntry[], folderId: string | null): Promise<void> {
  const batchId = `b${++seq}`;
  const batch: Batch = {
    id: batchId,
    folderId,
    targetName:
      folderId === null
        ? Promise.resolve("Home")
        : getFolders().then((all) => all.find((f) => f.id === folderId)?.name ?? "folder"),
    toasted: false,
  };
  batch.targetName.catch(() => {});
  batches.set(batchId, batch);

  const plans = await classifyEntries(entries);

  // Drop exact duplicates of anything already in flight (same target,
  // same name, same bytes) — e.g. the same file dropped twice.
  const live = new Set<string>();
  for (const j of uploadStore.get().jobs) {
    const ident = identities.get(j.id);
    if (ident && ACTIVE.has(j.stage)) live.add(ident);
  }

  const rows: UploadJob[] = [];
  for (const plan of plans) {
    const id = `u${++seq}`;
    if (!plan.reason) {
      const ident = await identityOf(plan, folderId);
      if (live.has(ident)) continue;
      live.add(ident);
      identities.set(id, ident);
    }
    runtimes.set(id, { plan, cancelled: false });
    const refused = !!plan.reason;
    rows.push({
      id,
      batchId,
      label: plan.label,
      name: plan.name,
      kind: plan.kind,
      stage: refused ? "skipped" : "queued",
      progress: 0,
      detail: describe(plan),
      message: plan.reason,
      unsupported: refused || undefined,
      cancellable: !refused,
    });
  }
  if (rows.length === 0) {
    batches.delete(batchId);
    return;
  }

  uploadStore.set((s) => ({ ...s, jobs: [...s.jobs, ...rows], open: true, collapsed: false }));
  pump();
  // A batch of only unsupported rows settles immediately.
  void maybeFinishBatch(batchId);
}

export function resolveConflict(jobId: string, choice: ConflictChoice, applyToAll = false): void {
  const ids = applyToAll
    ? uploadStore
        .get()
        .jobs.filter((j) => j.stage === "conflict")
        .map((j) => j.id)
    : [jobId];
  if (applyToAll) uploadStore.set((s) => ({ ...s, applyAll: choice }));
  for (const id of ids) {
    const rt = runtimes.get(id);
    const job = getJob(id);
    if (!rt || job?.stage !== "conflict") continue;
    if (choice === "skip") {
      setStage(id, "skipped", {
        message: "Skipped (name exists)",
        conflict: undefined,
        cancellable: false,
      });
      afterSettle(getJob(id));
      continue;
    }
    rt.resolution = choice;
    setStage(id, "queued", { message: undefined });
  }
  pump();
}

export function retryJob(jobId: string): void {
  const rt = runtimes.get(jobId);
  const job = getJob(jobId);
  if (!rt || job?.stage !== "error") return;
  rt.cancelled = false;
  const batch = batches.get(job.batchId);
  if (batch) batch.toasted = false;
  setStage(jobId, "queued", { message: undefined });
  pump();
}

export function retryAllFailed(): void {
  for (const j of uploadStore.get().jobs) if (j.stage === "error") retryJob(j.id);
}

/** Cancel a job that has not created its file yet. In-flight requests
 *  can't be aborted (the API client takes no signal), so a running job
 *  stops at its next checkpoint. */
export function cancelJob(jobId: string): void {
  const rt = runtimes.get(jobId);
  const job = getJob(jobId);
  if (!rt || !job?.cancellable) return;
  rt.cancelled = true;
  if (job.stage === "queued" || job.stage === "conflict" || job.stage === "error") {
    releaseReservation(rt);
    setStage(jobId, "skipped", {
      message: "Cancelled",
      cancellable: false,
      conflict: undefined,
    });
    afterSettle(getJob(jobId));
  }
}

export function cancelAll(): void {
  for (const j of uploadStore.get().jobs) if (ACTIVE.has(j.stage)) cancelJob(j.id);
}

/** Remove settled rows (and their runtime data). */
export function clearFinished(): void {
  const keep = uploadStore.get().jobs.filter((j) => ACTIVE.has(j.stage) || j.stage === "error");
  const keepIds = new Set(keep.map((j) => j.id));
  for (const id of runtimes.keys()) {
    if (!keepIds.has(id)) {
      runtimes.delete(id);
      identities.delete(id);
    }
  }
  for (const [id] of batches) {
    if (!keep.some((j) => j.batchId === id)) batches.delete(id);
  }
  uploadStore.set((s) => ({ ...s, jobs: keep }));
}

export function toggleUploadTray(open?: boolean): void {
  uploadStore.set((s) => {
    const next = open ?? !s.open;
    return next === s.open ? s : { ...s, open: next, collapsed: next ? false : s.collapsed };
  });
}

export function setTrayCollapsed(collapsed: boolean): void {
  uploadStore.set((s) => ({ ...s, collapsed }));
}

/** Close the tray. With nothing in flight the finished rows are
 *  dismissed too; otherwise uploads keep running in the background. */
export function dismissTray(): void {
  const active = uploadStore.get().jobs.some((j) => ACTIVE.has(j.stage));
  if (!active) {
    for (const id of runtimes.keys()) identities.delete(id);
    runtimes.clear();
    batches.clear();
    uploadStore.set((s) => ({ ...s, jobs: [], open: false }));
  } else {
    toggleUploadTray(false);
  }
}
