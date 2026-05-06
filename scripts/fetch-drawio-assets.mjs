#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Pinned draw.io webapp snapshot. This is intentionally separate from npm
// deps: draw.io is a standalone browser application, not a JS library.
const DRAWIO_REF = process.env.DRAWIO_REF || "5dc0133";
const repoUrl = "https://github.com/jgraph/drawio.git";
const root = process.cwd();
const tmp = join(tmpdir(), `inkwell-drawio-${DRAWIO_REF}`);
const repo = join(tmp, "repo");
const dest = join(root, "public", "drawio");

function run(cmd, args, cwd = root) {
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

run("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", repoUrl, repo]);
run("git", ["sparse-checkout", "set", "src/main/webapp"], repo);
try {
  run("git", ["fetch", "--depth", "1", "origin", DRAWIO_REF], repo);
  run("git", ["checkout", "FETCH_HEAD"], repo);
} catch {
  // Short SHA may already be the shallow HEAD. Keep going if checkout fails.
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(join(repo, "src", "main", "webapp"), dest, { recursive: true });
writeFileSync(
  join(dest, "INKWELL_DRAWIO_VERSION.txt"),
  `drawio ${DRAWIO_REF}\nsource ${repoUrl}\n`,
);

if (!existsSync(join(dest, "index.html"))) {
  throw new Error("draw.io asset copy failed: index.html missing");
}

// Post-process: inject our bootstrap script tag after drawio's
// `js/main.js` so we can monkey-patch `App.prototype.init` and expose
// the live `EditorUi` instance to the parent (Inkwell) frame. The
// bootstrap itself lives at `public/drawio-bootstrap.js` (a sibling
// of `public/drawio/`) so this `rmSync(dest)` doesn't wipe it.
//
// Idempotent: skips if the tag is already present (e.g. drawio is
// re-fetched into a working tree after the previous run was
// committed).
const INDEX_PATH = join(dest, "index.html");
const MAIN_TAG = '<script src="js/main.js"></script>';
const BOOTSTRAP_TAG = '<script src="/drawio-bootstrap.js"></script>';
let indexHtml = readFileSync(INDEX_PATH, "utf8");
if (!indexHtml.includes(BOOTSTRAP_TAG)) {
  if (!indexHtml.includes(MAIN_TAG)) {
    throw new Error(
      `draw.io index.html does not contain expected '${MAIN_TAG}'; bootstrap injection point missing`,
    );
  }
  indexHtml = indexHtml.replace(
    MAIN_TAG,
    `${MAIN_TAG}\n<script src="/drawio-bootstrap.js"></script>`,
  );
  writeFileSync(INDEX_PATH, indexHtml);
  process.stdout.write("injected /drawio-bootstrap.js into drawio/index.html\n");
}

process.stdout.write(`draw.io assets copied to ${dest}\n`);
