#!/usr/bin/env node
// biome-ignore-all lint/suspicious/noConsole: CLI script reports to stdout
// Redesign smoke test (Playwright, Chromium) against a running dev stack.
//
//   pnpm dev:worker   # :8888
//   pnpm dev          # :3838
//   SMOKE_EMAIL=… SMOKE_PASSWORD=… pnpm smoke
//
// Env:
//   SMOKE_BASE_URL   default http://localhost:3838
//   SMOKE_EMAIL / SMOKE_PASSWORD   an existing account (admin for the invite check);
//                    falls back to SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD from .dev.vars
//   SMOKE_SHOTS      optional directory for screenshots
//   SMOKE_HEADED=1   show the browser
//
// Every action has a timeout and the whole run is killed after 180 s.
// All fixtures live in a fresh "Smoke <timestamp>" project (plus an inbox
// capture, a palette file and an invite) and are purged at the end.
// Exit code 0 when every check passes.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const GLOBAL_TIMEOUT_MS = 180_000;
const killer = setTimeout(() => {
  console.log("GLOBAL TIMEOUT (180s)");
  process.exit(2);
}, GLOBAL_TIMEOUT_MS);

const BASE = (process.env.SMOKE_BASE_URL || "http://localhost:3838").replace(/\/$/, "");
const SHOTS = process.env.SMOKE_SHOTS || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

function devVars() {
  if (!existsSync(".dev.vars")) return {};
  return Object.fromEntries(
    readFileSync(".dev.vars", "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [
          l.slice(0, i).trim(),
          l
            .slice(i + 1)
            .trim()
            .replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}
const vars = devVars();
const EMAIL = process.env.SMOKE_EMAIL || vars.SUPER_ADMIN_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD || vars.SUPER_ADMIN_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Set SMOKE_EMAIL and SMOKE_PASSWORD.");
  process.exit(2);
}

const results = [];
const check = (name, pass, detail = "") => {
  results.push([name, !!pass]);
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null);

const browser = await chromium.launch({
  headless: !process.env.SMOKE_HEADED,
  args: ["--disable-dev-shm-usage"],
});
const context = await browser.newContext({ viewport: { width: 1500, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(10_000);
page.setDefaultNavigationTimeout(15_000);

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/401|404|Failed to load resource/.test(m.text())) {
    pageErrors.push(`[${new URL(page.url()).pathname}] ${m.text()}`);
  }
});

const api = (path, method = "GET", body) =>
  page.evaluate(
    async ([path, method, body]) => {
      const r = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { s: r.status, j: await r.json().catch(() => null) };
    },
    [path, method, body],
  );
const filesIn = async (folderId) => (await api(`/api/files?folderId=${folderId}`)).j?.files ?? [];
const blur = () => page.evaluate(() => document.activeElement?.blur?.());

const stamp = Date.now();
const cleanup = { folders: [], files: [], invites: [] };

try {
  // ─── Login ──────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login`);
  await page.fill("input[type=email]", EMAIL);
  await page.fill("input[type=password]", PASSWORD);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  check("login", true);

  // ─── Fixture: a project with a sub-folder and three files ───────────
  const root = (await api("/api/folders", "POST", { name: `Smoke ${stamp}` })).j;
  cleanup.folders.push(root.id);
  const dst = (await api("/api/folders", "POST", { name: "Dest", parentId: root.id })).j;
  await api("/api/folders", "POST", { name: "Empty", parentId: root.id });
  const fx = [];
  for (const [name, kind] of [
    ["Alpha", "excalidraw"],
    ["Beta", "drawio"],
    ["Gamma", "notes"],
  ]) {
    fx.push((await api("/api/files", "POST", { name, kind, folderId: root.id })).j);
  }
  cleanup.files.push(fx[0].id);

  // ─── Shell & Home ───────────────────────────────────────────────────
  await page.goto(`${BASE}/`);
  await page.waitForSelector('nav[aria-label="Sidebar"]');
  check(
    "home: capture box + sidebar",
    (await page.getByLabel("Capture a thought").count()) > 0 &&
      (await page.locator('nav[aria-label="Sidebar"] [data-drop-folder="root"]').count()) > 0,
  );
  await shot(page, "01-home");

  // ─── Capture: type + Enter lands a note in the Inbox ────────────────
  const thought = `Smoke thought ${stamp}`;
  await page.getByLabel("Capture a thought").first().fill(thought);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  const inbox = (await api("/api/files?folderId=root")).j?.files ?? [];
  const captured = (
    (await api(`/api/files?q=${encodeURIComponent(String(stamp))}`)).j?.files ?? []
  ).filter((f) => f.kind === "notes" && f.folderId == null);
  check("capture → note in Inbox", captured.length > 0, `${inbox.length} root files`);

  await page.goto(`${BASE}/inbox`);
  await page.waitForSelector("[data-item-key]");
  check(
    "inbox lists captured note",
    (await page.locator("[data-item-key]", { hasText: "Smoke thought" }).count()) > 0,
  );
  await shot(page, "02-inbox");

  // ─── Projects ───────────────────────────────────────────────────────
  await page.goto(`${BASE}/projects`);
  await page.getByText(`Smoke ${stamp}`).first().waitFor();
  check("projects page lists project", true);
  const newName = `Smoke UI ${stamp}`;
  await page
    .getByRole("button", { name: /New project/ })
    .first()
    .click();
  await page.getByLabel("Name").fill(newName);
  await page.getByRole("button", { name: /^(Create|Create project)$/ }).click();
  await page.waitForTimeout(1500);
  const created = ((await api("/api/folders")).j?.folders ?? []).find((f) => f.name === newName);
  if (created) {
    cleanup.folders.push(created.id);
    // Pinned projects sort first in the sidebar (which caps the list).
    await api(`/api/folders/${created.id}`, "PATCH", { pinnedAt: Date.now() });
  }
  check("new project dialog creates project", !!created && created.parentId == null);

  // ─── Folder page: Cards / List, selection ───────────────────────────
  await page.goto(`${BASE}/folders/${root.id}`);
  await page.waitForSelector("[data-item-key]");
  check("folder page renders items", (await page.locator("[data-item-key]").count()) >= 5);
  await shot(page, "03-cards");
  const layout = (n) => page.getByRole("radio", { name: n });
  await layout("List").click();
  await page.waitForTimeout(300);
  check("layout → List", (await layout("List").getAttribute("aria-checked")) === "true");
  await shot(page, "04-list");
  await layout("Cards").click();
  await page.waitForTimeout(300);
  check("layout → Cards", (await layout("Cards").getAttribute("aria-checked")) === "true");

  const item = (n) => page.locator("[data-item-key]", { hasText: n }).first();
  const selectedCount = () => page.locator('[data-item-key][aria-selected="true"]').count();

  await item("Alpha").click();
  await item("Gamma").click({ modifiers: ["Shift"] });
  check("shift range select", (await selectedCount()) >= 2, String(await selectedCount()));
  await item("Beta").click({ modifiers: ["Control"] });
  check("ctrl toggle", (await selectedCount()) >= 1);
  await page.keyboard.press("Control+a");
  await page.waitForTimeout(300);
  check(
    "select all",
    (await selectedCount()) === (await page.locator("[data-item-key]").count()),
    `${await selectedCount()}/${await page.locator("[data-item-key]").count()}`,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("esc clears", (await selectedCount()) === 0, String(await selectedCount()));

  await item("Alpha").click();
  await page.keyboard.press("F2");
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Alpha2");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  check(
    "F2 rename",
    (await filesIn(root.id)).some((f) => f.name === "Alpha2"),
  );

  await item("Beta").dragTo(item("Dest"));
  await page.waitForTimeout(1200);
  check(
    "drag file onto folder",
    (await filesIn(dst.id)).some((f) => f.name === "Beta"),
  );
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(1200);
  check(
    "ctrl+z undo move",
    (await filesIn(root.id)).some((f) => f.name === "Beta"),
  );

  const sideRow = page.locator(`nav[aria-label="Sidebar"] [data-drop-folder="${created?.id}"]`);
  if (created && (await sideRow.count())) {
    await item("Gamma").dragTo(sideRow.first());
    await page.waitForTimeout(1200);
    check(
      "drag onto sidebar project",
      (await filesIn(created.id)).some((f) => f.name === "Gamma"),
    );
  } else {
    check("drag onto sidebar project", false, "sidebar row not rendered");
  }

  await item("Dest").click({ button: "right" });
  await page.waitForTimeout(300);
  check("context menu", (await page.getByRole("menuitem").count()) > 3);
  await shot(page, "05-menu");
  await page.keyboard.press("Escape");

  // Star (S) → Files › Starred.
  await item("Beta").click();
  await page.keyboard.press("s");
  await page.waitForTimeout(900);
  const starred = (await api("/api/files?starred=1")).j?.files ?? [];
  await page.goto(`${BASE}/files/starred`);
  await page.waitForTimeout(1000);
  check(
    "star → Files/Starred",
    starred.some((f) => f.id === fx[1].id) &&
      (await page.locator("main").getByText("Beta", { exact: true }).count()) > 0,
  );

  // OS file drop of an unknown type → generic "file".
  await page.goto(`${BASE}/folders/${root.id}`);
  await page.waitForSelector("[data-item-key]");
  await item("Empty").dblclick();
  await page.waitForURL((u) => u.pathname.startsWith("/folders/") && !u.pathname.endsWith(root.id));
  await page.locator("main h1, main h2").first().waitFor();
  await page.waitForTimeout(500);
  const emptyId = new URL(page.url()).pathname.split("/").pop();
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File(["# Hi\n\ntext"], "dropped.md", { type: "text/markdown" }));
    d.items.add(new File(["a,b\n1,2"], "data.xyz", { type: "application/x-smoke" }));
    return d;
  });
  const dropTarget = page.locator("main h1, main h2").first();
  for (const ev of ["dragenter", "dragover", "drop"]) {
    await dropTarget.dispatchEvent(ev, { dataTransfer: dt });
  }
  let dropped = [];
  for (let i = 0; i < 20 && dropped.length < 2; i++) {
    await page.waitForTimeout(750);
    dropped = await filesIn(emptyId);
  }
  check(
    "OS drop: markdown → note",
    dropped.some((f) => f.name === "dropped" && f.kind === "notes"),
  );
  check(
    "OS drop: unknown type → generic file",
    dropped.some((f) => f.name.startsWith("data") && f.kind === "file"),
    dropped.map((f) => `${f.name}:${f.kind}`).join(","),
  );

  // ─── Palette & shortcut sheet ───────────────────────────────────────
  const paletteName = `Palette ${stamp}`;
  const pf = (await api("/api/files", "POST", { name: paletteName, kind: "excalidraw" })).j;
  cleanup.files.push(pf.id);
  await page.goto(`${BASE}/`);
  await page.waitForSelector('nav[aria-label="Sidebar"]');
  await blur();
  await page.keyboard.press("Control+k");
  await page.waitForSelector('input[aria-label="Search and commands"]');
  await page.keyboard.type(paletteName);
  await page
    .locator('#palette-results [role="option"]', { hasText: paletteName })
    .filter({ hasNotText: "Create" })
    .first()
    .waitFor();
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => u.pathname === `/f/${pf.id}`, { timeout: 8000 }).catch(() => {});
  check("⌘K search + open", new URL(page.url()).pathname === `/f/${pf.id}`);

  await page.goto(`${BASE}/`);
  await page.waitForSelector('nav[aria-label="Sidebar"]');
  await blur();
  await page.keyboard.press("Shift+?");
  const sheet = await page
    .getByRole("dialog")
    .filter({ hasText: "Keyboard shortcuts" })
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  check("? shortcut sheet", sheet);
  await page.keyboard.press("Escape");

  // ─── Files hub: tabs, Trash restore, legacy redirects ───────────────
  await page.goto(`${BASE}/files`);
  await page.getByRole("tablist", { name: "Files" }).waitFor();
  const tabs = await page
    .getByRole("tablist", { name: "Files" })
    .getByRole("tab")
    .allTextContents();
  check(
    "files hub tabs",
    ["All", "Recent", "Starred", "Shared", "Trash"].every((t) => tabs.includes(t)),
    tabs.join(","),
  );
  await shot(page, "06-files");

  await api("/api/items/trash", "POST", { items: [{ type: "file", id: pf.id }] });
  await page.goto(`${BASE}/files/trash`);
  const trashRow = page.locator("tr, li, [role=row]", { hasText: paletteName }).first();
  await trashRow.waitFor();
  await trashRow.hover();
  await trashRow.getByRole("button", { name: "Restore" }).click();
  await page.waitForTimeout(1200);
  const restored = ((await api("/api/files")).j?.files ?? []).some((f) => f.id === pf.id);
  check("Trash tab restore", restored);

  await page.goto(`${BASE}/shares`);
  await page.waitForURL((u) => u.pathname === "/files/shared");
  check("/shares → /files/shared", true);
  await page.goto(`${BASE}/users`);
  await page.waitForURL((u) => u.pathname === "/settings");
  check("/users → /settings#admin", new URL(page.url()).hash === "#admin", page.url());

  // ─── Settings: one page, Admin invite with a note ───────────────────
  await page.goto(`${BASE}/settings`);
  await page.locator("#about").waitFor();
  for (const h of ["appearance", "admin"]) {
    check(`settings section: ${h}`, (await page.locator(`#${h}`).count()) > 0);
  }
  await shot(page, "07-settings");
  const note = `smoke note ${stamp}`;
  await page.getByPlaceholder("e.g. For Maya’s contractor").fill(note);
  await page.getByRole("button", { name: /Create & copy link/ }).click();
  await page.waitForTimeout(1200);
  const invites = (await api("/api/admin/invites")).j?.invites ?? [];
  const inv = invites.find((i) => i.note === note);
  if (inv) cleanup.invites.push(inv.token);
  check("admin: invite with note", !!inv && (await page.getByText(note).count()) > 0);
} catch (e) {
  check("script", false, `${String(e?.message ?? e).split("\n")[0]} @ ${page.url()}`);
  await shot(page, "failure");
} finally {
  // ─── Cleanup (best effort) ──────────────────────────────────────────
  try {
    // Leave any fixture page first so it is not rendered while purged.
    await page.goto(`${BASE}/settings`);
    const items = [
      ...cleanup.folders.map((id) => ({ type: "folder", id })),
      ...cleanup.files.map((id) => ({ type: "file", id })),
    ];
    // Anything else named like our fixtures (inbox capture, palette, drops).
    const strays = ((await api(`/api/files?q=${encodeURIComponent(String(stamp))}`)).j?.files ?? [])
      .filter((f) => !cleanup.files.includes(f.id))
      .map((f) => ({ type: "file", id: f.id }));
    items.push(...strays);
    // One ref per request: some items are already in Trash.
    for (const it of items) await api("/api/items/trash", "POST", { items: [it] });
    for (const it of items) await api("/api/items/purge", "POST", { items: [it] });
    for (const t of cleanup.invites) await api(`/api/admin/invites/${t}`, "DELETE");
  } catch (e) {
    console.log(`cleanup failed: ${String(e).split("\n")[0]}`);
  }
}

check("no page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
await browser.close();
clearTimeout(killer);
const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
