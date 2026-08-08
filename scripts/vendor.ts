#!/usr/bin/env bun
// Clone Bun monorepo and extract vendored packages.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dir + "/..";
const VENDOR_DIR = join(ROOT, "vendor");
const BUN_TAG = "bun-v1.3.14"; // pinned tag — update VENDOR.md when changing

async function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[vendor] ${cmd} ${args.join(" ")}`);
    const child = spawn(cmd, args, {
      cwd,
      stdio: ["inherit", "inherit", "inherit"],
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} exited with code ${code}`));
      }
    });
  });
}

async function main(): Promise<void> {
  const force = Bun.argv.includes("--force");
  if (!force && existsSync(VENDOR_DIR) && existsSync(join(VENDOR_DIR, "bun-debug-adapter-protocol", "package.json"))) {
    console.log("[vendor] Vendor packages already present. Pass --force to re-clone.");
    process.exit(0);
  }

  mkdirSync(VENDOR_DIR, { recursive: true });

  const tmpDir = join(ROOT, ".tmp-bun-clone");
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true });
  }

  console.log(`[vendor] Cloning Bun monorepo at ${BUN_TAG}...`);
  await run("git", [
    "clone",
    "--depth", "1",
    "--branch", BUN_TAG,
    "https://github.com/oven-sh/bun.git",
    tmpDir,
  ], ROOT);

  const pkgs = [
    "bun-debug-adapter-protocol",
    "bun-inspector-protocol",
  ];

  for (const pkg of pkgs) {
    const src = join(tmpDir, "packages", pkg);
    const dest = join(VENDOR_DIR, pkg);
    if (!existsSync(src)) {
      console.error(`[vendor] Missing package in clone: ${pkg}`);
      process.exit(1);
    }
    cpSync(src, dest, { recursive: true });
    console.log(`[vendor] Copied ${pkg}`);
  }

  rmSync(tmpDir, { recursive: true });
  console.log("[vendor] Done.");
}

main().catch((err) => {
  console.error("[vendor] FAILED:", err);
  process.exit(1);
});
