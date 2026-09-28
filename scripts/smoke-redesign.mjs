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
// All fixtures live in a fresh "Smoke <timestamp>" folder (plus one
// palette file, a starred item and an invite) and are purged at the end.
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
    pageErrors.push(m.text());
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

  // ─── Fixture ────────────────────────────────────────────────────────
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
  cleanup.files.push(fx[0].id); // Alpha gets trashed on its own below

  // ─── Explorer ───────────────────────────────────────────────────────
  await page.goto(`${BASE}/folders/${root.id}`);
  await page.waitForSelector("[data-item]");
  check("explorer renders items", (await page.locator("[data-item]").count()) >= 5);
  await shot(page, "01-grid");

  const pane = page.locator("[data-explorer-pane]").first();
  for (const [key, view] of [
    ["2", "compact"],
    ["3", "list"],
    ["4", "columns"],
    ["1", "grid"],
  ]) {
    await pane.click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press("Escape");
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
    const on = await page
      .locator(
        `[data-view="${view}"][aria-pressed="true"],[data-view="${view}"][data-state="on"],[data-view="${view}"][aria-checked="true"]`,
      )
      .count();
    check(`view key ${key} → ${view}`, on > 0);
  }

  const item = (n) => page.locator("[data-item]", { hasText: n }).first();
  const selectedCount = () => page.locator('[data-item][aria-selected="true"]').count();

  await item("Alpha").click();
  await item("Gamma").click({ modifiers: ["Shift"] });
  check("shift range select", (await selectedCount()) === 3, String(await selectedCount()));
  await item("Beta").click({ modifiers: ["Control"] });
  check("ctrl toggle", (await selectedCount()) === 2);
  await page.keyboard.press("Control+a");
  check("select all", (await selectedCount()) === (await page.locator("[data-item]").count()));
  await page.keyboard.press("Escape");
  check("esc clears", (await selectedCount()) === 0);

  const box = await pane.boundingBox();
  const a1 = await item("Alpha").boundingBox();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10);
  await page.mouse.down();
  await page.mouse.move(a1.x + 10, a1.y + 10, { steps: 8 });
  await page.mouse.up();
  check("marquee selects", (await selectedCount()) >= 1, String(await selectedCount()));

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

  await item("Beta").click();
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

  const treeRow = page.locator(`[data-drop-folder="${dst.id}"]`).first();
  if (await treeRow.count()) {
    await item("Gamma").dragTo(treeRow);
    await page.waitForTimeout(1200);
    check(
      "drag onto sidebar tree row",
      (await filesIn(dst.id)).some((f) => f.name === "Gamma"),
    );
  } else {
    check("drag onto sidebar tree row", false, "tree row not rendered");
  }

  await item("Alpha2").dragTo(page.locator("[data-drop-trash]").first());
  await page.waitForTimeout(1200);
  check("drag onto Trash", !(await filesIn(root.id)).some((f) => f.name === "Alpha2"));

  await item("Dest").click({ button: "right" });
  await page.waitForTimeout(300);
  check("context menu", (await page.getByRole("menuitem").count()) > 3);
  await shot(page, "02-menu");
  await page.keyboard.press("Escape");

  await item("Beta").click();
  await page.keyboard.press(" ");
  await page.waitForTimeout(400);
  check("quick look opens", (await page.locator("[role=dialog]").count()) > 0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("i");
  await page.waitForTimeout(400);
  check(
    "details panel shows name",
    (await page.locator("aside,[data-details-panel]").filter({ hasText: "Beta" }).count()) > 0,
  );
  await page.keyboard.press("i");

  // Star (S) → Starred page.
  await item("Beta").click();
  await page.keyboard.press("s");
  await page.waitForTimeout(900);
  const starred = (await api("/api/files?starred=1")).j?.files ?? [];
  await page.goto(`${BASE}/starred`);
  await page.waitForTimeout(1000);
  check(
    "star → Starred page",
    starred.some((f) => f.id === fx[1].id) &&
      (await page.locator("main").getByText("Beta", { exact: true }).count()) > 0,
  );

  // Duplicate a folder (⌘D / Ctrl+D).
  await page.goto(`${BASE}/folders/${root.id}`);
  await page.waitForSelector("[data-item]");
  await item("Dest").click();
  await page.keyboard.press("Control+d");
  await page.waitForTimeout(1500);
  const subfolders = ((await api("/api/folders")).j?.folders ?? []).filter(
    (f) => f.parentId === root.id,
  );
  check(
    "duplicate folder",
    subfolders.some((f) => f.name === "Dest (copy)"),
  );

  await page.goto(`${BASE}/folders/${dst.id}?select=file:${fx[2].id}`);
  await page.waitForTimeout(1200);
  check(
    "?select= reveal",
    (await page.locator('[data-item][aria-selected="true"]', { hasText: "Gamma" }).count()) === 1,
  );

  // OS file drop into an empty folder.
  await page.goto(`${BASE}/folders/${root.id}`);
  await item("Empty").dblclick();
  await page.waitForTimeout(800);
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File(["# Hi\n\ntext"], "dropped.md", { type: "text/markdown" }));
    return d;
  });
  const dropTarget = page.locator("[data-explorer-pane]").first();
  for (const ev of ["dragenter", "dragover", "drop"]) {
    await dropTarget.dispatchEvent(ev, { dataTransfer: dt });
  }
  await page.waitForTimeout(4000);
  const emptyId = (await api("/api/folders")).j.folders.find(
    (f) => f.name === "Empty" && f.parentId === root.id,
  ).id;
  check(
    "OS file drop uploads",
    (await filesIn(emptyId)).some((f) => f.name === "dropped" && f.kind === "notes"),
  );

  // ─── Palette & shortcut sheet ───────────────────────────────────────
  const paletteName = `Palette ${stamp}`;
  const pf = (await api("/api/files", "POST", { name: paletteName, kind: "excalidraw" })).j;
  cleanup.files.push(pf.id);
  await page.goto(`${BASE}/`);
  await page.waitForSelector('nav[aria-label="Sidebar"]');
  await blur();
  await page.keyboard.press("Control+k");
  await page.waitForSelector('input[aria-label="Command palette search"]');
  await page.keyboard.type(paletteName);
  // Wait for the search hit itself (the "Create … named" row also contains the name).
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
  await shot(page, "03-shortcuts");
  await page.keyboard.press("Escape");

  // ─── Trash page restore ─────────────────────────────────────────────
  await api("/api/items/trash", "POST", { items: [{ type: "file", id: pf.id }] });
  await page.goto(`${BASE}/trash`);
  const trashRow = page.locator("tr", { hasText: paletteName }).first();
  await trashRow.waitFor();
  await trashRow.hover();
  await trashRow.getByRole("button", { name: "Restore" }).click();
  await page.waitForTimeout(1200);
  const restored = ((await api("/api/files")).j?.files ?? []).some((f) => f.id === pf.id);
  check("Trash page restore", restored);

  // ─── Settings: rebind a key ─────────────────────────────────────────
  await page.goto(`${BASE}/settings/shortcuts`);
  const capture = page.locator('[data-capture="view.details"]').first();
  await capture.click();
  await page.keyboard.press("Shift+J");
  await page.waitForTimeout(400);
  const keymap = await page.evaluate(() => localStorage.getItem("inkwell.keymap") || "{}");
  check("Settings rebind a key", /"view\.details":\["shift\+j"\]/.test(keymap), keymap);
  await page.evaluate(() => localStorage.removeItem("inkwell.keymap"));

  // ─── Shared links page ──────────────────────────────────────────────
  await page.goto(`${BASE}/shares`);
  const sharesOk = await page
    .locator("main")
    .getByText("Shared links")
    .first()
    .waitFor()
    .then(() => true)
    .catch(() => false);
  check("Shared links page renders", sharesOk);

  // ─── Invite with a note (admin) ─────────────────────────────────────
  const note = `smoke note ${stamp}`;
  await page.goto(`${BASE}/users/invites`);
  await page.getByRole("button", { name: "Invite user" }).first().click();
  await page.getByPlaceholder("e.g. For Maya’s contractor").fill(note);
  await page.getByRole("button", { name: /Create & copy link/ }).click();
  await page.waitForTimeout(1200);
  const invites = (await api("/api/admin/invites")).j?.invites ?? [];
  const inv = invites.find((i) => i.note === note);
  if (inv) cleanup.invites.push(inv.token);
  check("invite with note", !!inv && (await page.locator("main").getByText(note).count()) > 0);
} catch (e) {
  check("script", false, String(e?.message ?? e).split("\n")[0]);
} finally {
  // ─── Cleanup (best effort) ──────────────────────────────────────────
  try {
    const items = [
      ...cleanup.folders.map((id) => ({ type: "folder", id })),
      ...cleanup.files.map((id) => ({ type: "file", id })),
    ];
    // Anything else named like our fixtures (e.g. created from the palette).
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
