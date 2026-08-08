#!/usr/bin/env bun
/**
 * Sync bridge binary and assets to Zed's dev extension work directory.
 * Run this after Zed rebuilds the WASM extension (which wipes the work dir).
 */
import { mkdirSync, copyFileSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dir + "/..";
const SOURCE_DIR = join(ROOT, "extension");
const WORK_DIR = join(
  process.env.HOME!,
  "Library/Application Support/Zed/extensions/work/bun-debugger"
);

function sync(): void {
  console.log("[sync] Syncing to Zed work directory...");
  
  // Ensure directories exist
  mkdirSync(join(WORK_DIR, "bin"), { recursive: true });
  mkdirSync(join(WORK_DIR, "debug_adapter_schemas"), { recursive: true });

  // Copy bridge binary
  const bridgeSource = join(SOURCE_DIR, "bin", "bridge");
  const bridgeDest = join(WORK_DIR, "bin", "bridge");
  
  if (existsSync(bridgeSource)) {
    copyFileSync(bridgeSource, bridgeDest);
    chmodSync(bridgeDest, 0o755);
    console.log("[sync] ✓ Bridge binary synced");
  } else {
    console.error("[sync] ✗ Bridge binary not found. Run 'bun run build' first.");
    process.exit(1);
  }

  // Copy debug adapter schema
  const schemaSource = join(SOURCE_DIR, "debug_adapter_schemas", "bun-debug.json");
  const schemaDest = join(WORK_DIR, "debug_adapter_schemas", "bun-debug.json");
  
  if (existsSync(schemaSource)) {
    copyFileSync(schemaSource, schemaDest);
    console.log("[sync] ✓ Debug adapter schema synced");
  }

  console.log("[sync] Done!");
}

sync();
