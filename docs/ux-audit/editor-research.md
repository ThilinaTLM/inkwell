# Editor experience research: Inkwell

## Summary

- **Header:** one shared 44px `EditorHeader` for all owner kinds. Each editor adds a kind-specific `toolbar` slot. Markdown is the only kind with a real toolbar; Excalidraw and draw.io have none, and static-site has only an "Open" button. Excalidraw's own menu duplicates some file actions.
- **Save:** autosave with a 30s debounce, optimistic-concurrency version checks (409 → reload + conflict banner), and flush on unload and on leave. There is no Ctrl+S handler for Excalidraw or Markdown. Only draw.io's own Ctrl+S is wired (via its `save` event).
- **"Edited" on open:** the most likely cause is a fingerprint mismatch between the stored blob and the scene Excalidraw normalises on mount, which makes the first `onChange` look like a change. Not verified at runtime.
- **Shortcuts:** the global dispatcher is not mounted on editor routes, so single-key shortcuts don't clash with Excalidraw. The editor only has a narrow set of chords, and some registry bindings are displayed but may not be dispatched.
- **Export:** file-level download is per kind (`.md`, `.excalidraw` JSON, `.drawio` XML, `.zip` for sites). PNG/SVG export exists only inside Excalidraw's own menu. Markdown→HTML/PDF and draw.io→PNG/SVG are not exposed.
- **Static HTML:** a single `.html` file is not a viewer or editor. It becomes a one-asset `static-site` bundle, and there is no inline HTML editing.

## 1. Editor header and chrome

**Shared header.** `src/features/editor/EditorHeader.tsx` is the single 44px bar (`h-11`) above every editor. Header comment at lines 1–28.

Controls in the header, left to right, for owner mode:

| # | Control | Shown for | Source |
|---|---|---|---|
| 1 | Back arrow (`mod+[`, label "Back to folder") | all owner kinds (when `onBack`) | EditorHeader.tsx header render (~L225–245) |
| 2 | Breadcrumb: Home icon › folder crumbs (collapsed to `Home › first › … › last two`) | all owner kinds | `OwnerCrumbs` (~L300–370) |
| 3 | Kind glyph + file name (click or F2 → inline rename) | all | `InlineRename` (~L370–400) |
| 4 | Save indicator | all owner kinds, except when `status` is null | `SaveIndicator` (L472–530) |
| 5 | `bridge.toolbar` slot | markdown (layout/width/font/theme), static-site ("Open") | EditorHeader.tsx header render |
| 6 | Star toggle (`aria-pressed`) | all owner kinds | `OwnerActions` (~L620–660) |
| 7 | Share (outline, text on sm+) | all owner kinds | `OwnerActions` |
| 8 | ⋯ "File actions" menu | all owner kinds | `OwnerActions` |
| 9 | Keyboard shortcuts button (hidden below `sm`) | all owner kinds | header render |
| 10 | `UserMenu` avatar | all | header render |

The conflict banner renders below the header when `conflict` is set (`ConflictBanner`, ~L740+).

**The ⋯ menu (`OwnerActions`).** Items in order: Rename (F2), Move to…, Duplicate, Download, any `bridge.menuExtras`, Tags…, separator, Move to Trash (destructive).

**Visitor mode** (`SharedEditorPage`). Hides every owner action. Shows a "Shared · Can edit / View only" chip and a Download button when allowed.

**Per-kind header content:**

| Kind | Bridge (`toolbar` / `menuExtras`) | Header extras | Save state |
|---|---|---|---|
| Excalidraw (`ExcalidrawEditor.tsx` ~L195–230) | no `toolbar`, no `menuExtras` | none | yes |
| draw.io (`DrawioEditor.tsx` ~L615–640) | no `toolbar`, no `menuExtras` | menubar lives inside the iframe. Trailing slot `DrawioSidebarToggles` is portalled in (~L560) | yes ("loading" until `ready`) |
| Markdown (`MarkdownEditor.tsx` L140–160) | `toolbar: <MarkdownEditorChrome />` | Source/Split/Preview segmented control (≥sm), a mobile layout dropdown, width dropdown, font dropdown, theme dropdown | yes; "loading" while `source === null` |
| Static site (`StaticSiteEditor.tsx` ~L200–230) | `staticBridge({ toolbar: <Button>Open</Button> })` | "Open" primary button | likely none (`status` null → `SaveIndicator` returns null; not verified) |

**`ExcalidrawMenu.tsx`** (the Excalidraw canvas `<MainMenu>`):
- Owner: `SaveAsImage` · separator · `ToggleTheme` (allowSystemTheme) · `ClearCanvas` · `Help`.
- Shared: `ToggleTheme` · `SaveAsImage` · `Help`.

It says file-level actions "live in the editor header".

**draw.io menu integration.** The draw.io menubar is inside the iframe. Inkwell restyles it via an injected stylesheet (`DrawioEditor.tsx` ~L148–250) and attaches a trailing container (`ensureSlots`, ~L270–300). The iframe loads with `noSaveBtn: 1, noExitBtn: 1` (~L454). Draw.io's own File/Export menu is therefore still present but not documented here; whether it exposes PNG/SVG is unverified.

**Duplication and inconsistency:**
- Two dropdowns use the same icon (`Layout01Icon`): `LayoutQuickToggle` and `WidthQuickToggle` (`MarkdownEditorChrome.tsx`).
- Markdown has a theme dropdown in the header, but Excalidraw and draw.io put theme in the canvas menu or not at all. The app theme is also in the global user menu.
- Excalidraw has its own "Save as image" and "Clear canvas" in the canvas menu, while the header duplicates file actions.
- Owner Share is on every kind; the header lacks an export menu entirely.
- The "Edited" label uses `text-foreground` and a dot; "Saved · v12" uses muted text with a check.

## 2. Save model

**Files:** `src/features/editor/lifecycle/useSaveLifecycle.ts` (314 lines), `useDebounced.ts` (68 lines).

**Debounce.** `SAVE_DEBOUNCE_MS = 30_000` (useSaveLifecycle.ts ~L37). `useDebounced` resets the timer on each call and exposes `flush()`/`cancel()`. Unmount cancels it, and the lifecycle's unmount effect calls `flush()`.

**Flush points:**
- `beforeunload`: flushes, and sets `returnValue` while dirty (native prompt).
- `visibilitychange` to hidden: flushes.
- Editor unmount: flushes.
- In-app navigation: `useLeaveConfirm` plus `LeaveConfirmDialog` ("Save & Leave" / Discard).
- Excalidraw has no "save now" shortcut; the header "Edited" label is clickable to save now (`SaveIndicator`, L533–547).

**Dedup.** `notifyChange` compares the snapshot fingerprint with `savedFpRef` and cancels a pending save if they match. Excalidraw's fingerprint is `fingerprintScene` (`ExcalidrawEditor.tsx` ~L310–352): element versions, a whitelist of appState fields, and file keys. Markdown uses `fingerprintMarkdown`. Draw.io uses `hashXml`.

**Concurrency.** An in-flight save is coalesced with `inflightRef`/`saveQueuedRef`, and the loop takes another lap if the snapshot changed mid-flight.

**Version conflicts.** The PUT sends `If-Match` (`versionRef`). On 409 (`useSaveLifecycle.ts` ~L170–190) it calls `transport.reload()` and sets `status="error"` with message "Refreshed: another tab saved a newer version." Then:
- The editor is re-seeded with the fresh blob (`onReload`); draw.io pushes the XML into the iframe.
- `EditorPage` shows the conflict banner with Reload / Dismiss.
- The header shows "Conflict" (`isConflictMessage`, `SaveIndicator`).
- A reload drops unsaved edits made since the last save, per the banner text.

**State meanings (`SaveIndicator`, `EditorHeader.tsx` L472–530):**

| Label | Status | Meaning |
|---|---|---|
| Loading… | loading | file or scene not ready |
| Saving… | saving | PUT in flight |
| Edited | dirty | local change pending the 30s debounce (click to save now) |
| Conflict | error (409) | another tab saved; reload offered |
| Offline — retry | error (offline/network) | click to retry |
| Save failed — retry | error (other) | click to retry |
| Saved · v{n} | saved | last PUT succeeded at this version |

**Bug to note:** `isDirty` includes `status === "error"` (`useSaveLifecycle.ts` ~L268). After a conflict reload the status is `error`, so the unload guard fires even though nothing is unsaved. Errors also don't auto-retry; they wait for the next change or a click.

**Why an untouched Excalidraw file can flip to "Edited".** `ExcalidrawEditor.tsx`:
1. `initialSnapshot` is fingerprinted from the raw stored `appState` and elements (~L70–80). Excalidraw normalises state on mount: it fills in `currentItem*` defaults, restores element versions, and may change `name`. So the first `onChange` gives a different fingerprint string.
2. `onChange` (~L232) calls `lifecycle.notifyChange()`. Because the fingerprint differs from `savedFp`, status becomes `dirty` (`setStatus(s => s === "saving" ? s : "dirty")`).
3. The name-sync effect (~L252–268) calls `updateScene({appState:{name}})` when `appState.name` differs from `meta.name`. That also fires `onChange`.
4. After 30s, `saveLatest` sees a fingerprint mismatch and PUTs. The version bumps silently (e.g., v1→v2) and the header shows "Saved · v2".

The most likely cause is (1), with (3) as a contributor. This needs a runtime check: log `initialSnapshot.fp` against the first `onChange` fingerprint for `f1-1790444227`, and diff the appState and element versions.

## 3. Keyboard shortcuts

**`keymap.ts`** (436 lines) parses, normalises, matches and formats bindings. `mod` is ⌘ on mac and Ctrl elsewhere. It supports chords and user overrides in localStorage.

**`registry.ts`** holds the command registry. `Command.scopes` and `when(ctx)` gate availability per surface.

**`useGlobalHotkeys.ts`** (97 lines):
- Mounted once in `AppShell`, "never on editor routes" (header comment).
- Ignores input, textarea, select, contenteditable, `data-hotkeys="off"`, and open dialog/menu popups.
- Honours the `singleKeyShortcuts` pref.
- So in editors, none of the registry's global bindings (e.g. `mod+shift+c`, `mod+shift+d`, `shift+s`) are dispatched by this hook.

**Shortcuts that do fire on editor routes** (from `EditorOverlays.tsx`, `EditorHeader.tsx`, `EditorPage.tsx`):

| Shortcut | Behaviour | Where |
|---|---|---|
| `mod+K` | command palette (capture phase, so it wins over Excalidraw) | EditorOverlays.tsx ~L95–110 |
| `mod+shift+/` | shortcut sheet | EditorOverlays.tsx |
| `mod+[` | back (bubble phase, so editors that consume it keep it) | EditorHeader.tsx `onKey` |
| `Esc Esc` | back, only when focus is inside the header | EditorHeader.tsx `onHeaderKeyDown` |
| `F2` | inline rename (not when typing) | EditorHeader.tsx; also `item.rename` override in EditorPage.tsx |
| `Ctrl/⌘+S` | nothing in Inkwell (see below) | — |
| draw.io `save` event | Cmd-S inside draw.io → `saveNow()` | DrawioEditor.tsx ~L494 |

**Conflicts and gaps:**
- Single-key shortcuts don't clash with Excalidraw (1–9, S, T, etc.) because Inkwell doesn't bind them in editors, and EditorOverlays documents this intentionally.
- EditorPage's `overrides` list declares `item.download` and `item.trash`, but `nav.back` and `app.shortcuts` carry `keys`. EditorOverlays only dispatches `mod+K` and `mod+shift+/` itself. The shortcut sheet may therefore show bindings that aren't dispatched in editors. Not verified.
- Ctrl+S: `grep` found no `mod+s` binding or `KeyS` handler in `src/` or the markdown editor. Excalidraw's own Ctrl+S (`saveToActiveFile` is disabled via `canvasActions`, ExcalidrawEditor.tsx ~L240) may still be bound internally. Not verified; Bash was denied, so I could not check the minified bundle.

## 4. Import and export

**Import (upload pipeline):**

| Input | Detected as | Notes | Source |
|---|---|---|---|
| `.excalidraw`, `.json` with `elements` | excalidraw | `POST /api/files/import` creates and writes in one request. Worker normalises the scene (`normalizeImportedExcalidraw`). | classify.ts L9, L41; worker/routes/files.ts L193–230 |
| `.drawio`, `.xml`/`.drawio.xml` with `<mxfile>`/`<mxGraphModel>` | drawio | Empty or non-diagram XML rejected | classify.ts L10, L43–44; pipeline.ts `prepareJob` |
| `.md`, `.markdown`, `.txt` | notes | `normalizeMarkdownSource` | classify.ts L45 |
| `.zip`, single `.html`/`.htm`, folder with `index.html` | static-site | Single HTML zipped (`zipEntries`), entry is the shallowest `.html` | classify.ts L12, L46–47; pipeline.ts ~L40–60 |

- The `DropOverlay.tsx` lists supported types (L12–15).
- `EditorOverlays` mounts only the palette, shortcut sheet and dialog host. It does not mount the upload drop zone. **So drag-in import is not available inside editor routes** (from reading code; not verified in the browser).

**Export and download:**

| Kind | Download (`GET /api/files/:id/download`) | Format | Source |
|---|---|---|---|
| Markdown | attachment `.md` (markdown-v1 source); legacy blocks → `.notes.json` | `text/markdown` | worker/lib/responses.ts L95–115 |
| Excalidraw | stored JSON blob with `.excalidraw` extension | `application/json` | responses.ts L117–125 (default path) |
| draw.io | raw XML with `.drawio` | `application/xml` | responses.ts L126–130 |
| Static site | zip re-packaged from R2 assets | `application/zip` | responses.ts L131–150 |
| Multi-item / folder | client zip (`downloadAsZip`, fflate, 3-way fetch) | `.zip` | src/features/actions/download.ts |
| Shared folder | `downloadShareZip` | `.zip` | src/features/editor/shared/shareZip.ts |

**PNG/SVG export:**
- Excalidraw: via the canvas menu's `SaveAsImage` (client-side, Excalidraw's dialog). Not in the header.
- draw.io: only through draw.io's own iframe menu. Not in Inkwell chrome.
- Markdown → HTML or PDF: none found. `grep` for export/html/pdf/print in `src/features/editor` returned nothing.
- Static site → HTML/PDF: none; zip only.

**Gaps:**
- No export menu in the header.
- No Markdown→HTML/PDF, no Excalidraw/draw.io PNG/SVG from the header, no draw.io PNG/SVG export through Inkwell chrome.
- Excalidraw download is the raw stored JSON, which is not guaranteed to be the same as Excalidraw's own `.excalidraw` export shape.

## 5. Static site / HTML artifacts

- A single `.html` is classified as `static-site` with `site: "html"` (classify.ts L47). It is zipped on upload (`zipEntries`) and stored as a manifest with R2 assets (`worker/services/static-site.ts`).
- Viewing: StaticSiteEditor is a management page. Its header says "there is intentionally no inline iframe preview" and the rendered site opens in a new tab via a signed `/sites/:id/:sig/<entry>` URL (StaticSiteEditor.tsx L1–30). The "Open" button mints a render session (`openPreviewMutation`, ~L200+).
- Files in `src/features/editor/static-site/`: `SiteCard.tsx`, `FilesList.tsx`, `FileRow.tsx`, `UploadPanel.tsx`, `fileKindChip.ts`.
- Mutations: upload assets, replace via ZIP, delete asset, set entry. Each is a POST with `If-Match`, and 409s show a toast. There is no autosave and no `useSaveLifecycle` (StaticSiteEditor.tsx L24–27).
- **Inline HTML editing: none.** No CodeMirror or contenteditable for `.html`; the markdown CodeMirror is only used for notes. Editing requires re-uploading.
- **Preview inside Inkwell: none.** The only preview is a new tab. There is no single-file artifact viewer.

## 6. Recommendations

1. **Unified header:** one component with a kind-specific center/right slot. Put file actions (Share, Export, ⋯) in one place for all kinds, and remove the duplicate Save-as-image and clear-canvas entries from Excalidraw's menu where they conflict.
2. **Ctrl+S semantics:** add `mod+s` to all editors (save now, `preventDefault`), keep autosave, and show a "Saved" check with the tooltip "Ctrl+S". For draw.io, keep the `save` event bridge.
3. **Fix the spurious "Edited":** normalise `initialSnapshot` by running the same Excalidraw normalisation on the stored blob before fingerprinting, or fingerprint only element versions plus whitelisted fields from the first onChange. Add a regression test that opens an unmodified file and asserts `status === "saved"` after 31s.
4. **Fix the error-dirty bug:** `isDirty` should not include `error` after a successful conflict reload; reserve it for truly unsaved content.
5. **Export menu:** a single "Export as…" in the header (`.excalidraw` / PNG / SVG for scenes; `.md` / HTML / PDF for notes; `.drawio` / PNG / SVG for diagrams; `.zip` for sites). Excalidraw and draw.io PNG/SVG need per-kind implementations.
6. **Drag-in import:** mount the upload drop zone on editor routes, or add a Import action in the ⋯ menu.
7. **Single-file HTML viewer/editor:** for a single `.html` file, provide a preview pane (sandboxed iframe, with the existing signed render URL) and an optional source tab using CodeMirror. Keep the bundle manager for multi-file sites.
8. **Shortcut sheet honesty:** only list bindings the editor dispatches. Consider dispatching the editor chords through the registry so the sheet and behaviour stay in sync.

## Relevant files

- src/features/editor/EditorHeader.tsx (header L1–28 comment; SaveIndicator L472–530; OwnerActions ~L620–700; ConflictBanner ~L740+)
- src/features/editor/EditorChrome.tsx, EditorOverlays.tsx (L1–20 keymap comment; L95–110 capture-phase handler)
- src/features/editor/MarkdownEditorChrome.tsx (toolbar)
- src/features/editor/EditorPage.tsx (header bridge ~L380–420; overrides ~L300–360; save ~L150–180)
- src/features/editor/ExcalidrawEditor.tsx (initialSnapshot ~L70–80; onChange ~L232; name effect ~L252–268; fingerprintScene L310–352)
- src/features/editor/ExcalidrawMenu.tsx (L1–36)
- src/features/editor/DrawioEditor.tsx (menubar style L148–250; ensureSlots ~L270–300; init/save/export handlers ~L430–530; bridge ~L615–640)
- src/features/editor/MarkdownEditor.tsx (L40–160)
- src/features/editor/StaticSiteEditor.tsx (L1–30 intent; L200+ Open button)
- src/features/editor/lifecycle/useSaveLifecycle.ts (SAVE_DEBOUNCE_MS ~L37; saveLatest ~L100–200; notifyChange ~L195; isDirty ~L268)
- src/features/editor/lifecycle/useDebounced.ts (L1–68)
- src/lib/commands/keymap.ts (L1–436), registry.ts, useGlobalHotkeys.ts (L1–97)
- src/features/upload/classify.ts, pipeline.ts, DropOverlay.tsx
- src/features/actions/download.ts, itemCommands.ts (L434–445)
- src/features/editor/shared/shareZip.ts
- worker/routes/files.ts (import L193–230; download L240–245)
- worker/lib/responses.ts (streamFileResponse L79–168)
- worker/services/static-site.ts

## Evidence

- Bash was denied during this session, so I could not run the app, `grep` via shell, or check the minified Excalidraw bundle. All findings are from `Read`, `Grep` and `find`.
- Line numbers marked "~" are approximate, read from partial file views.
- The "Edited" cause is a reasoned hypothesis from the fingerprint code, not reproduced.

## Open questions

1. Does Excalidraw's internal Ctrl+S (saveToActiveFile) fire in Inkwell despite `saveToActiveFile: false`? Needs a bundle check or a runtime test.
2. Are the registry bindings (`mod+shift+d`, `shift+s`) dispatched anywhere on editor routes? I found no dispatcher; confirm in the browser.
3. Does draw.io's native iframe menu expose PNG/SVG export to users?
4. Is the static-site page's save-state indicator hidden (status null), as I inferred?
5. **The mockup was not built.** Writing `docs/ux-audit/mockups/*` conflicts with this read-only researcher assignment. If you want it, I can build it in a session where writes are allowed, or you can re-dispatch it to a writing agent. The browser-verification steps also depend on Bash, which was denied here.