#!/usr/bin/env bun
// Verify build artifacts exist.

import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dir + "/..";

function assertExists(path: string, label: string): void {
  if (!existsSync(path)) {
    console.error(`❌ Missing ${label}: ${path}`);
    process.exit(1);
  }
  console.log(`✅ ${label} exists`);
}

async function main(): Promise<void> {
  console.log("[verify] Checking build artifacts...");

  assertExists(join(ROOT, "extension/bin/bridge"), "Bridge executable");
  assertExists(join(ROOT, "extension/extension.wasm"), "WASM extension");
  assertExists(join(ROOT, "extension/extension.toml"), "Extension manifest");
  assertExists(join(ROOT, "vendor/bun-debug-adapter-protocol/package.json"), "Vendored DAP adapter");
  assertExists(join(ROOT, "vendor/bun-inspector-protocol/package.json"), "Vendored inspector protocol");

  const { execSync } = await import("node:child_process");
  try {
    const version = execSync("head -1 " + join(ROOT, "extension/bin/bridge")).toString().trim();
    if (!version.includes("#!/usr/bin/env node")) {
      console.error("❌ Bridge missing shebang");
      process.exit(1);
    }
    console.log("✅ Bridge has shebang");
  } catch {
    console.error("❌ Could not read bridge shebang");
    process.exit(1);
  }

  console.log("[verify] All artifacts present.");
}

main().catch((err) => {
  console.error("[verify] FAILED:", err);
  process.exit(1);
});
