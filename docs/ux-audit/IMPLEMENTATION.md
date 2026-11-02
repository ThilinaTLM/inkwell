# Redesign implementation plan

> **Status (2026-11-04):** Stages 1–3 are complete on `feat/ui-redesign`.
> - **Checks:** `pnpm check:ci`, `pnpm typecheck`, `pnpm test` (129), `pnpm build` and `pnpm smoke` (31/31) all pass.
> - **Screenshots:** progress screenshots per agent are in `progress/`.
> - **Delivered beyond the original stages:** generic file storage and viewer (Phase 4), and whiteboard Present mode (Phase 5, first cut).
>
> **Follow-ups**
> - PDF thumbnails (needs pdf.js).
> - Sessions (board + notes template), item links and embeds.
> - PWA/offline.
> - A server-side note excerpt for card previews.
> - Unused-dependency audit for note fonts and `@blocknote/core` (still used by legacy note conversion).

Branch: `feat/ui-redesign`. Read [`README.md`](./README.md) for the audit and decisions, and see [`mockups/b-warm.html`](./mockups/b-warm.html) for the visual direction (look and feel only).

## Product decisions (binding)
- **Desktop first.** Mobile is a responsive fallback: the sidebar becomes a drawer, and a bottom bar gives Home, Inbox, ＋Capture, Search and Files.
- **Project = top-level folder** (`parentId === null`). Sub-folders are plain folders.
- **Inbox = loose root files** (`folderId === null`). Quick captures land there unless you are inside a project or folder.
- **No emoji in the UI.** Hugeicons (`@hugeicons/react` + `@hugeicons/core-free-icons`) everywhere.
  - A project's identity is a curated icon key plus a colour key, shown on a soft tile (`ProjectIcon`).
- **Show only real data.** No fake progress bars or sparklines.
- **Removed:** Columns and Compact views, thumbnail sizes, column chooser, explorer behaviour prefs, shortcut rebinding, tags in the sidebar, the status bar, back/forward/up buttons, the separate Users page (it moves into Settings → Admin).
- **Fixed behaviour:**
  - Sort is by recently edited, with folders first.
  - Double-click opens on desktop; tap opens on touch.
  - ⌘/Ctrl-click opens in a new tab.
  - Upload conflicts keep both copies.
  - Trash uses undo, not a confirmation.
- **Two collection layouts only:** Cards and List. The choice is remembered per device, not per folder.

## Visual tokens (from mockup B)
| Token | Light | Dark |
|---|---|---|
| Background | warm paper `#F7F2E8` | ink navy `#0E1525` |
| Sidebar surface | slightly darker paper | slightly lighter ink |
| Cards | near-white paper with hairline warm borders and soft shadow | ink-raised surfaces |
| Accent (primary buttons, active states, focus) | burnt orange `#B84A14` | `#EE8442` |

- **Accent use:** sparing.
- **Status pills:** soft green for Active, amber for Paused, grey for Done.
- **Fonts:** **Fraunces** for display and headings (page titles, greeting, card titles where appropriate) and **Inter** for UI. Drop Geist, Manrope and Lora from the UI.
- **Note fonts:** markdown editor typography may keep a Sans/Serif choice (Inter / Source Serif).
- **Radius and spacing:** 10–14px radii, 8px spacing grid.

## Folder metadata contract (backend ↔ frontend)
`FolderMeta` gains:

```ts
icon: string | null;        // curated Hugeicons key, e.g. "rocket", "book", "flask", "chart", "code", "presentation", "folder", "star", "briefcase", "palette", "server", "globe"
color: string | null;       // one of: "orange","amber","green","teal","blue","indigo","violet","rose","slate"
description: string | null; // ≤ 280 chars
status: "active" | "paused" | "done" | null; // null = not set (treat as active for display)
pinnedAt: number | null;    // epoch ms; pinned projects show on Home
```

All of these are settable through `PATCH /api/folders/:id` and optional on `POST /api/folders`. The frontend owns the mapping from key to Hugeicon and colour classes.

## Generic file kind contract (cloud storage)
- `files.kind` gains `"file"`, and `FileMeta` gains `mime: string | null`.
- The upload endpoint stores the raw bytes in R2.
  - `GET /api/files/:id/raw` streams the file inline with the correct Content-Type. Its CSP sandboxes HTML.
  - `/download` serves the file as an attachment.
- Unknown file types dropped or picked in the UI become `kind: "file"` instead of being rejected.

## Routes (new)
| Route | Page |
|---|---|
| `/` | Home: greeting, capture box, Continue (recent items), Pinned projects, Inbox preview |
| `/inbox` | Inbox (root loose files) |
| `/projects` | All projects (cards); New project |
| `/folders/:folderId` | Folder page. Shows the project header when the folder is top level, otherwise a folder header with a breadcrumb. |
| `/files` | Files hub with tabs: All · Recent · Starred · Shared · Trash (`/files/:tab?`). "All" is a flat, type-filterable list of every file. |
| `/settings` | One page: Profile & password · Appearance · Admin (users & invites, admins only) · About |
| `/f/:id` | Editors (unchanged route) |
| Redirects | Old routes (`/recent`, `/starred`, `/trash`, `/shares`, `/tags/:tag`, `/users`) redirect to the new equivalents |

## Stages and ownership
| Stage | Owners | Scope |
|---|---|---|
| 1 | **foundation** (ui) | tokens, shell, `ItemCollection`, `ProjectIcon`, route skeleton |
| 1 | **backend** (dev) | `worker/`, `drizzle/`, `src/lib/api/`, `src/data/`, `src/features/upload/` |
| 1 | **editor** (dev) | `src/features/editor/**` |
| 2 | Page owners | Home+capture; Projects+folder page; Files hub+search; Settings |
| 3 | Cleanup and QA | Delete the old explorer, library and shell code; update the smoke test; full QA |

## Commit rules
- Commit to `feat/ui-redesign` with conventional commits, as you go.
- Stage **only your own files** (`git add <paths>`). Never use `git add -A`, `git commit -a`, or anything that touches other agents' files. Never rewrite history.
- The pre-commit hook runs `pnpm check:ci && pnpm typecheck && pnpm test`. Your files must pass. Run `pnpm exec biome check --write <your files>` first.
- If the hook fails **only** because of files owned by another active agent, you may commit with `--no-verify`. Say so in your handoff.
- If `.git/index.lock` exists, wait a few seconds and retry.
