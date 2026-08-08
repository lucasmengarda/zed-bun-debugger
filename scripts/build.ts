#!/usr/bin/env bun
// Build script: bundles bridge and compiles WASM extension.

import { spawn } from "node:child_process";
import { mkdirSync, renameSync, chmodSync, copyFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = import.meta.dir + "/..";
const EXTENSION_DIR = join(ROOT, "extension");
const BIN_DIR = join(EXTENSION_DIR, "bin");

// `get_dap_binary` resolves the bridge relative to the extension's *work* directory, and prefers
// a `bridge` sitting there over anything else — that is where `download_file` drops the released
// binary on first use. A dev extension symlinked from this repo therefore keeps running that stale
// download until the freshly built bridge is copied over it.
const ZED_WORK_DIRS = [
  join(homedir(), "Library", "Application Support", "Zed", "extensions", "work", "bun-debugger"),
  join(homedir(), ".local", "share", "zed", "extensions", "work", "bun-debugger"),
];

async function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[build] ${cmd} ${args.join(" ")}`);
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

async function buildBridge(): Promise<void> {
  console.log("[build] Building bridge...");
  mkdirSync(BIN_DIR, { recursive: true });

  const bridgeJs = join(BIN_DIR, "bridge.js");
  const bridgeBin = join(BIN_DIR, "bridge");

  await run("bun", [
    "build",
    "src/main.ts",
    "--target=node",
    "--outfile=" + bridgeJs,
  ], join(ROOT, "bridge"));

  renameSync(bridgeJs, bridgeBin);
  chmodSync(bridgeBin, 0o755);

  console.log("[build] Bridge built at", bridgeBin);
  syncDevExtension(bridgeBin);
}

function syncDevExtension(bridgeBin: string): void {
  for (const workDir of ZED_WORK_DIRS) {
    if (!existsSync(workDir)) {
      continue;
    }
    const target = join(workDir, "bridge");
    copyFileSync(bridgeBin, target);
    chmodSync(target, 0o755);
    console.log("[build] Bridge synced to Zed work dir", target);
  }
}

async function buildWasm(): Promise<void> {
  console.log("[build] Building WASM extension...");
  await run("cargo", [
    "build",
    "--target", "wasm32-wasip1",
    "--release",
  ], EXTENSION_DIR);

  const wasmSrc = join(EXTENSION_DIR, "target", "wasm32-wasip1", "release", "bun_debugger.wasm");
  const wasmDest = join(EXTENSION_DIR, "extension.wasm");

  copyFileSync(wasmSrc, wasmDest);
  console.log("[build] WASM built at", wasmDest);
}

async function main(): Promise<void> {
  try {
    await buildBridge();
    await buildWasm();
    console.log("[build] All done!");
    process.exit(0);
  } catch (err) {
    console.error("[build] FAILED:", err);
    process.exit(1);
  }
}

main();
