// Central cache-invalidation map.
//
// Without this, ~25 mutation hooks each duplicated their own list of
// `qc.invalidateQueries({ queryKey: keys.… })` calls, and adding a new
// query prefix meant grepping for each hook that should also bust it.
//
// Each helper takes the QueryClient and any disambiguators (folder id,
// share target, etc.) and invalidates exactly the prefixes the
// underlying mutation can affect. The set is the union of what each
// hook used to invalidate individually — verified by side-by-side diff
// during the refactor.

import type { QueryClient } from "@tanstack/react-query";
import type { ShareTargetType } from "@/lib/api/client";
import { keys, shareListKey } from "@/lib/api/query-keys";

export const invalidations = {
  /**
   * Anything that changed a file row at the meta-data level (rename,
   * move, retag, delete, share-mutation that touches activeShareCount).
   * Files affect folder list rows because folders carry a fileCount.
   */
  fileMutated(qc: QueryClient, opts: { tagsChanged?: boolean; sharesChanged?: boolean } = {}) {
    qc.invalidateQueries({ queryKey: keys.files.all });
    qc.invalidateQueries({ queryKey: keys.folders.all });
    if (opts.tagsChanged) qc.invalidateQueries({ queryKey: keys.tags.all });
    if (opts.sharesChanged) qc.invalidateQueries({ queryKey: keys.sharesAll });
  },

  /**
   * Folder mutations (create / rename / move / delete / retag). Delete
   * cascades into files and shares server-side, so the broad invalidation
   * set covers both. `tagsChanged` covers the create/update case where
   * the body included a `tags` array.
   */
  folderMutated(
    qc: QueryClient,
    opts: { filesChanged?: boolean; tagsChanged?: boolean; sharesChanged?: boolean } = {},
  ) {
    qc.invalidateQueries({ queryKey: keys.folders.all });
    if (opts.filesChanged) qc.invalidateQueries({ queryKey: keys.files.all });
    if (opts.tagsChanged) qc.invalidateQueries({ queryKey: keys.tags.all });
    if (opts.sharesChanged) qc.invalidateQueries({ queryKey: keys.sharesAll });
  },

  /**
   * A share row mutated (create / update / rotate / revoke). The
   * per-target list refreshes so the open dialog updates, the global
   * /shares page refreshes, and the file/folder cards refresh because
   * they carry an `activeShareCount` pill.
   */
  shareMutated(qc: QueryClient, targetType: ShareTargetType, targetId: string) {
    qc.invalidateQueries({ queryKey: shareListKey(targetType, targetId) });
    qc.invalidateQueries({ queryKey: keys.sharesAll });
    qc.invalidateQueries({ queryKey: keys.files.all });
    qc.invalidateQueries({ queryKey: keys.folders.all });
  },

  /**
   * Generic share mutation from the /shares management page where the
   * row's target type isn't conveniently in scope. Invalidates the
   * sharesAll prefix plus both file/folder list prefixes (cards refresh
   * regardless of which target the token pointed at).
   */
  shareMutatedGeneric(qc: QueryClient) {
    qc.invalidateQueries({ queryKey: keys.sharesAll });
    qc.invalidateQueries({ queryKey: keys.files.all });
    qc.invalidateQueries({ queryKey: keys.folders.all });
  },

  /**
   * Tag mutations (rename / delete) ripple through every file and
   * folder list as well as the tag list itself.
   */
  tagMutated(qc: QueryClient) {
    qc.invalidateQueries({ queryKey: keys.tags.all });
    qc.invalidateQueries({ queryKey: keys.files.all });
    qc.invalidateQueries({ queryKey: keys.folders.all });
  },
};
