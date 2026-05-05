// Public types for the editor save lifecycle.
//
// `EditorSaveStatus` mirrors the values the topbar / Drawio status
// control branches on; both editors must agree on these names.

export type EditorSaveStatus = "dirty" | "saving" | "saved" | "error";

/**
 * Transport interface the lifecycle calls into. The editor wires this
 * to its specific persistence client (owner `files.save`, share-token
 * `shares.save`, etc.).
 */
export interface SaveLifecycleTransport<TBlob, TLoaded> {
  /** Persist the blob. Throw `ApiError(409)` on optimistic-concurrency conflict. */
  save: (version: number, blob: TBlob) => Promise<{ version: number }>;
  /** Re-fetch the canonical state after a 409. Optional; conflicts surface as
   *  errors when omitted. */
  reload?: () => Promise<TLoaded>;
}
