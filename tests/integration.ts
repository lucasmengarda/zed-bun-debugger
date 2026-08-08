#!/usr/bin/env bun
// Integration test: bridge initializes, launches Bun, handles disconnect.

import { spawn } from "node:child_process";
import { join } from "node:path";

const BRIDGE_PATH = join(import.meta.dir, "../extension/bin/bridge");

function sendDAP(stdin: NodeJS.WritableStream, msg: object): void {
  const json = JSON.stringify(msg);
  const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;
  stdin.write(header + json);
}

function readDAP(stdout: NodeJS.ReadableStream): Promise<unknown[]> {
  return new Promise((resolve) => {
    const messages: unknown[] = [];
    let buffer = Buffer.alloc(0);

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

    stdout.on("end", () => resolve(messages));
  });
}

async function main(): Promise<void> {
  console.log("[integration] Starting bridge test...");

  if (!Bun.file(BRIDGE_PATH).exists()) {
    console.error("[integration] Bridge not built. Run: bun run scripts/build.ts");
    process.exit(1);
  }

  const bridge = spawn("node", [BRIDGE_PATH], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  const responsesPromise = readDAP(bridge.stdout!);

  // Send initialize
  sendDAP(bridge.stdin!, { seq: 1, type: "request", command: "initialize", arguments: { adapterID: "bun-debug" } });

  // Wait for initialize response + initialized event
  await new Promise((r) => setTimeout(r, 200));

  // Send launch with a simple test script
  const testScript = join(import.meta.dir, "fixtures/test-script.ts");
  sendDAP(bridge.stdin!, {
    seq: 2,
    type: "request",
    command: "launch",
    arguments: {
      program: testScript,
      args: [],
    },
  });

  // Wait a bit for Bun to start
  await new Promise((r) => setTimeout(r, 3000));

  // Send disconnect
  sendDAP(bridge.stdin!, { seq: 3, type: "request", command: "disconnect" });

  // Wait for bridge to exit
  await new Promise((r) => setTimeout(r, 1000));
  bridge.kill();

  const messages = await responsesPromise;

  // Assertions
  const initResponse = messages.find(
    (m: any) => m.type === "response" && m.command === "initialize",
  );
  if (!initResponse) {
    console.error("❌ No initialize response");
    process.exit(1);
  }
  console.log("✅ Initialize response received");

  const initEvent = messages.find((m: any) => m.type === "event" && m.event === "initialized");
  if (!initEvent) {
    console.error("❌ No initialized event");
    process.exit(1);
  }
  console.log("✅ Initialized event received");

  const launchResponse = messages.find(
    (m: any) => m.type === "response" && m.command === "launch",
  );
  if (!launchResponse) {
    console.error("❌ No launch response");
    process.exit(1);
  }
  if (!(launchResponse as any).success) {
    console.error("❌ Launch failed:", (launchResponse as any).message);
    process.exit(1);
  }
  console.log("✅ Launch succeeded");

  console.log("[integration] All assertions passed.");
}

main().catch((err) => {
  console.error("[integration] FAILED:", err);
  process.exit(1);
});
