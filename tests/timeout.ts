#!/usr/bin/env bun
// Test: bridge handles bad launch gracefully.

import { spawn } from "node:child_process";
import { join } from "node:path";

const BRIDGE_PATH = join(import.meta.dir, "../extension/bin/bridge");

function sendDAP(stdin: NodeJS.WritableStream, msg: object): void {
  const json = JSON.stringify(msg);
  const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;
  stdin.write(header + json);
}

function readDAP(stdout: NodeJS.ReadableStream, timeoutMs: number): Promise<unknown[]> {
  return new Promise((resolve) => {
    const messages: unknown[] = [];
    let buffer = Buffer.alloc(0);
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(messages);
      }
    }, timeoutMs);

    stdout.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) break;
        const header = buffer.slice(0, headerEnd).toString();
        const match = header.match(/Content-Length:\s*(\d+)/);
        if (!match) {
          buffer = buffer.slice(headerEnd + 4);
          continue;
        }
        const len = parseInt(match[1], 10);
        const total = headerEnd + 4 + len;
        if (buffer.length < total) break;
        const body = JSON.parse(buffer.slice(headerEnd + 4, total).toString());
        messages.push(body);
        buffer = buffer.slice(total);
      }
    });

    stdout.on("end", () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve(messages);
      }
    });
  });
}

async function main(): Promise<void> {
  console.log("[timeout-test] Starting bad-launch test...");

  if (!Bun.file(BRIDGE_PATH).exists()) {
    console.error("[timeout-test] Bridge not built.");
    process.exit(1);
  }

  const bridge = spawn("node", [BRIDGE_PATH], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  const responsesPromise = readDAP(bridge.stdout!, 15000);

  // Initialize
  sendDAP(bridge.stdin!, { seq: 1, type: "request", command: "initialize", arguments: {} });
  await new Promise((r) => setTimeout(r, 200));

  // Launch with a fake runtime to trigger failure
  sendDAP(bridge.stdin!, {
    seq: 2,
    type: "request",
    command: "launch",
    arguments: {
      program: "test.ts",
      runtime: "nonexistent_runtime_xyz_12345",
    },
  });

  // Wait for failure signals (should be quick, not the full 10s inspector timeout)
  await new Promise((r) => setTimeout(r, 3000));
  bridge.kill();

  const messages = await responsesPromise;

  const launchResponse = messages.find(
    (m: any) => m.type === "response" && m.command === "launch",
  );

  if (!launchResponse) {
    console.error("❌ No launch response received");
    process.exit(1);
  }

  // The adapter may return success for launch even if the runtime is missing,
  // because it communicates failure via events. Verify we got termination.
  const terminatedEvent = messages.find(
    (m: any) => m.type === "event" && m.event === "terminated",
  );

  if (!terminatedEvent) {
    console.error("❌ No terminated event received — bridge may have hung");
    process.exit(1);
  }

  console.log("✅ Bridge did not hang; received termination event");
  console.log("[timeout-test] Passed.");
}

main().catch((err) => {
  console.error("[timeout-test] FAILED:", err);
  process.exit(1);
});
