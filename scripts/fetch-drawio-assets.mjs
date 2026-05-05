#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

process.stdout.write(`draw.io assets copied to ${dest}\n`);
