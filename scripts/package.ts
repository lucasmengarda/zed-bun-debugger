#!/usr/bin/env bun
// Package script: create a distributable archive of the extension.

import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dir + "/..";
const EXTENSION_DIR = join(ROOT, "extension");
const OUT_DIR = join(ROOT, "dist");

async function main(): Promise<void> {
  console.log("[package] Packaging extension...");

  const required = [
    join(EXTENSION_DIR, "extension.toml"),
    join(EXTENSION_DIR, "extension.wasm"),
    join(EXTENSION_DIR, "bin/bridge"),
  ];

  for (const path of required) {
    if (!existsSync(path)) {
      console.error(`[package] Missing required file: ${path}`);
      console.error("[package] Run 'bun run build' first.");
      process.exit(1);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const archiveName = `bun-debugger-v0.1.0`;
  const archivePath = join(OUT_DIR, `${archiveName}.tar.gz`);

  execSync(
    `tar -czf "${archivePath}" -C "${EXTENSION_DIR}" .`,
    { stdio: "inherit" },
  );

  console.log(`[package] Created ${archivePath}`);

  const dirOut = join(OUT_DIR, archiveName);
  if (existsSync(dirOut)) {
    execSync(`rm -rf "${dirOut}"`);
  }
  mkdirSync(dirOut, { recursive: true });
  execSync(`cp -R "${EXTENSION_DIR}/"* "${dirOut}/"`);

  console.log(`[package] Copied to ${dirOut}`);
}

main().catch((err) => {
  console.error("[package] FAILED:", err);
  process.exit(1);
});
