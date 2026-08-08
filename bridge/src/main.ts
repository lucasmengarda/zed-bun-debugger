#!/usr/bin/env node
// Bun DAP Bridge — stdio server that proxies DAP to the Bun adapter.

import { decodeDAP, encodeDAP, type DAPRequest, type DAPResponse, type DAPEvent } from "./types.ts";
import { AdapterLoader } from "./adapter-loader.ts";

let seq = 1;
function nextSeq(): number {
  return seq++;
}

function log(...args: unknown[]): void {
  console.error("[bridge]", ...args);
}

function sendDAP(msg: unknown): void {
  process.stdout.write(encodeDAP(msg));
}

let buffer = Buffer.alloc(0);
let adapter: AdapterLoader | null = new AdapterLoader(onEvent, onResponse);
let initialized = false;
let initializedEventSent = false;
let duplicateInitializedDropped = false;

function onEvent(event: DAPEvent): void {
  // We synthesize `initialized` right after the `initialize` response, so the adapter's first
  // one — emitted when the inspector attaches to the freshly launched process — is a duplicate.
  // Every later one comes from a `--watch`/`--hot` reload re-attaching and MUST reach the
  // client, otherwise breakpoints are never re-registered against the new runtime.
  if (event.event === "initialized" && initializedEventSent && !duplicateInitializedDropped) {
    duplicateInitializedDropped = true;
    return;
  }
  event.seq = nextSeq();
  log("EVT ->", event.event);
  sendDAP(event);
}

function onResponse(response: DAPResponse): void {
  response.seq = nextSeq();
  log("RES ->", response.command, response.success ? "ok" : "fail");
  sendDAP(response);
  if (response.command === "initialize" && !initializedEventSent) {
    initializedEventSent = true;
    const evt: DAPEvent = { type: "event", seq: nextSeq(), event: "initialized", body: {} };
    log("EVT ->", evt.event);
    sendDAP(evt);
  }
}

process.stdin.on("data", (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);

  const { messages, remaining } = decodeDAP(buffer);
  buffer = remaining;

  for (const msg of messages) {
    if (msg.type === "request") {
      const request = msg as DAPRequest;
      log("REQ <-", request.command, request.seq);

      if (request.command === "initialize") {
        initialized = true;
        const modifiedRequest = {
          ...request,
          arguments: {
            ...request.arguments,
            supportsConfigurationDoneRequest: true,
          },
        };
        adapter!.handleRequest(modifiedRequest).catch((err) => {
          log("Initialize error:", err);
        });
        continue;
      }

      if (!initialized && request.command !== "initialize") {
        sendDAP({
          type: "response",
          seq: nextSeq(),
          request_seq: request.seq,
          command: request.command,
          success: false,
          message: "Adapter not initialized",
        });
        continue;
      }

      if (request.command === "launch") {
        adapter!.handleRequest(request).catch((err) => {
          log("Launch error:", err);
        });
        continue;
      }

      if (request.command === "disconnect") {
        if (adapter) {
          adapter.handleRequest(request).catch((err) => {
            log("Disconnect error:", err);
          });
          adapter.dispose();
          adapter = null;
        }
        sendDAP({
          type: "response",
          seq: nextSeq(),
          request_seq: request.seq,
          command: "disconnect",
          success: true,
        });
        setTimeout(() => process.exit(0), 500);
        continue;
      }

      if (adapter) {
        adapter.handleRequest(request).catch((err) => {
          log("Request error:", request.command, err);
          sendDAP({
            type: "response",
            seq: nextSeq(),
            request_seq: request.seq,
            command: request.command,
            success: false,
            message: String(err),
          });
        });
      } else {
        sendDAP({
          type: "response",
          seq: nextSeq(),
          request_seq: request.seq,
          command: request.command,
          success: false,
          message: "No active debug session",
        });
      }
    }
  }
});

process.stdin.on("end", () => {
  log("stdin closed, cleaning up...");
  if (adapter) {
    adapter.dispose();
    adapter = null;
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("SIGTERM received, exiting");
  if (adapter) {
    adapter.dispose();
    adapter = null;
  }
  process.exit(0);
});

process.on("unhandledRejection", (err) => {
  log("Unhandled rejection:", err);
});

log("Bun DAP Bridge ready. Waiting for DAP messages on stdin...");
