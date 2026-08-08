#!/usr/bin/env bun
// E2E test: bridge DAP protocol and debug flow including breakpoints.

import { spawn } from "node:child_process";
import { join } from "node:path";

const BRIDGE_PATH = join(import.meta.dir, "../extension/bin/bridge");

function sendDAP(stdin: NodeJS.WritableStream, msg: object): void {
  const json = JSON.stringify(msg);
  const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;
  stdin.write(header + json);
}

function createMessageCollector(stdout: NodeJS.ReadableStream) {
  const messages: any[] = [];
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

  return {
    getMessages: () => [...messages],
    waitFor: (predicate: (m: any) => boolean, timeoutMs: number): Promise<any> =>
      new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
          const found = messages.find(predicate);
          if (found) {
            resolve(found);
            return;
          }
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Timeout waiting for message`));
            return;
          }
          setTimeout(check, 100);
        };
        check();
      }),
  };
}

async function main(): Promise<void> {
  console.log("[e2e] Starting Bun debugger E2E test...\n");

  if (!Bun.file(BRIDGE_PATH).exists()) {
    console.error("[e2e] Bridge not built. Run: bun run scripts/build.ts");
    process.exit(1);
  }

  const bridge = spawn("node", [BRIDGE_PATH], { stdio: ["pipe", "pipe", "inherit"] });
  const collector = createMessageCollector(bridge.stdout!);
  const testScript = join(import.meta.dir, "fixtures/debugger-test.ts");

  // Test 1: Initialize
  console.log("TEST 1: Initialize");
  sendDAP(bridge.stdin!, {
    seq: 1, type: "request", command: "initialize",
    arguments: { adapterID: "bun-debug" },
  });
  await collector.waitFor((m) => m.type === "event" && m.event === "initialized", 5000);
  console.log("✅ Initialize works\n");

  // Test 2: Set breakpoints BEFORE launch (fire and forget — inspector isn't connected yet)
  console.log("TEST 2: Set breakpoints");
  sendDAP(bridge.stdin!, {
    seq: 2, type: "request", command: "setBreakpoints",
    arguments: {
      source: { path: testScript },
      breakpoints: [{ line: 7 }],
    },
  });

  // Test 3: Launch
  console.log("TEST 3: Launch");
  sendDAP(bridge.stdin!, {
    seq: 3, type: "request", command: "launch",
    arguments: { program: testScript, args: [] },
  });
  const launchResponse = await collector.waitFor(
    (m) => m.type === "response" && m.command === "launch", 5000
  );
  if (!launchResponse?.success) {
    console.error("❌ Launch failed:", launchResponse?.message);
    process.exit(1);
  }
  console.log("✅ Launch works\n");

  // Verify setBreakpoints succeeded now that inspector is connected
  const bpResponse = await collector.waitFor(
    (m) => m.type === "response" && m.command === "setBreakpoints", 10000
  );
  if (!bpResponse?.success) {
    console.error("❌ Failed to set breakpoints:", bpResponse?.message);
    process.exit(1);
  }
  console.log("✅ Breakpoints can be set\n");

  // Wait for Bun to connect
  console.log("[e2e] Waiting 2s for Bun to connect...\n");
  await new Promise((r) => setTimeout(r, 2000));

  // Test 4: configurationDone
  console.log("TEST 4: configurationDone");
  sendDAP(bridge.stdin!, {
    seq: 4, type: "request", command: "configurationDone",
  });
  const configDoneResponse = await collector.waitFor(
    (m) => m.type === "response" && m.command === "configurationDone", 3000
  );
  if (!configDoneResponse?.success) {
    console.error("❌ configurationDone failed:", configDoneResponse?.message);
    process.exit(1);
  }
  console.log("✅ configurationDone works\n");

  // Test 5: Breakpoint is hit
  console.log("TEST 5: Breakpoint hit");
  const stoppedEvent = await collector.waitFor(
    (m) => m.type === "event" && m.event === "stopped", 5000
  );
  if (stoppedEvent?.body?.reason !== "breakpoint") {
    console.error("❌ Expected stopped reason 'breakpoint', got:", stoppedEvent?.body?.reason);
    process.exit(1);
  }
  if (!stoppedEvent?.body?.hitBreakpointIds || stoppedEvent.body.hitBreakpointIds.length === 0) {
    console.error("❌ Expected hitBreakpointIds to be set");
    process.exit(1);
  }
  console.log("✅ Breakpoint is hit (reason: breakpoint, hitBreakpointIds:", stoppedEvent.body.hitBreakpointIds, ")\n");

  // Small delay to ensure Bun has actually paused before sending continue
  await new Promise((r) => setTimeout(r, 500));

  // Test 6: Continue
  console.log("TEST 6: Continue");
  sendDAP(bridge.stdin!, {
    seq: 5, type: "request", command: "continue",
    arguments: { threadId: stoppedEvent.body.threadId },
  });
  const continueResponse = await collector.waitFor(
    (m) => m.type === "response" && m.command === "continue", 3000
  );
  if (!continueResponse?.success) {
    console.error("❌ Continue failed:", continueResponse?.message);
    process.exit(1);
  }
  console.log("✅ Continue works\n");

  // Test 7: Script exits after continuing
  console.log("TEST 7: Script exits after continuing");
  const exitedEvent = await collector.waitFor(
    (m) => m.type === "event" && m.event === "exited", 5000
  );
  if (!exitedEvent) {
    console.error("❌ Did not receive exited event");
    process.exit(1);
  }
  console.log("✅ Script exited\n");

  // Test 8: Disconnect
  console.log("TEST 8: Disconnect");
  sendDAP(bridge.stdin!, {
    seq: 6, type: "request", command: "disconnect",
  });
  await collector.waitFor((m) => m.type === "response" && m.command === "disconnect", 3000);
  console.log("✅ Disconnect works\n");

  await new Promise((r) => setTimeout(r, 1000));
  bridge.kill();

  console.log("[e2e] Test complete.");
  console.log("\nSummary:");
  console.log("- Bridge DAP protocol: ✅ Working");
  console.log("- Bun launch/connect: ✅ Working");
  console.log("- Breakpoints: ✅ Working");
}

main().catch((err) => {
  console.error("[e2e] FAILED:", err);
  process.exit(1);
});
