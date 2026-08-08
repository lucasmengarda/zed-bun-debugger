// Unit tests for DAP framing.

import { describe, it, expect } from "bun:test";
import { encodeDAP, decodeDAP } from "../bridge/src/types.ts";

describe("DAP framing", () => {
  it("encodes a message with Content-Length header", () => {
    const msg = { seq: 1, type: "request", command: "initialize" };
    const encoded = encodeDAP(msg);
    expect(encoded).toStartWith("Content-Length: ");
    expect(encoded).toContain("\r\n\r\n");
    expect(encoded).toContain('"command":"initialize"');
  });

  it("decodes a single message", () => {
    const msg = { seq: 1, type: "request", command: "initialize" };
    const encoded = encodeDAP(msg);
    const buffer = Buffer.from(encoded, "utf8");
    const { messages, remaining } = decodeDAP(buffer);
    expect(messages.length).toBe(1);
    expect(messages[0].type).toBe("request");
    expect((messages[0] as any).command).toBe("initialize");
    expect(remaining.length).toBe(0);
  });

  it("decodes multiple messages in one buffer", () => {
    const msg1 = { seq: 1, type: "request", command: "initialize" };
    const msg2 = { seq: 2, type: "request", command: "launch" };
    const buffer = Buffer.from(encodeDAP(msg1) + encodeDAP(msg2), "utf8");
    const { messages, remaining } = decodeDAP(buffer);
    expect(messages.length).toBe(2);
    expect((messages[0] as any).command).toBe("initialize");
    expect((messages[1] as any).command).toBe("launch");
    expect(remaining.length).toBe(0);
  });

  it("handles partial messages", () => {
    const msg = { seq: 1, type: "request", command: "initialize" };
    const encoded = encodeDAP(msg);
    const buffer = Buffer.from(encoded.slice(0, 10), "utf8");
    const { messages, remaining } = decodeDAP(buffer);
    expect(messages.length).toBe(0);
    expect(remaining.length).toBe(10);
  });

  it("handles malformed headers gracefully", () => {
    const buffer = Buffer.from("Bad-Header: 123\r\n\r\n{}", "utf8");
    const { messages, remaining } = decodeDAP(buffer);
    expect(messages.length).toBe(0);
    // Should skip past the bad header
    expect(remaining.length).toBeLessThan(buffer.length);
  });

  it("handles leftover data after complete messages", () => {
    const msg = { seq: 1, type: "request", command: "initialize" };
    const encoded = encodeDAP(msg);
    const extra = Buffer.from(" leftover");
    const buffer = Buffer.concat([Buffer.from(encoded), extra]);
    const { messages, remaining } = decodeDAP(buffer);
    expect(messages.length).toBe(1);
    expect(remaining.toString()).toBe(" leftover");
  });

  it("handles Unicode content correctly", () => {
    const msg = { seq: 1, type: "event", event: "output", body: { output: "héllo 🌍" } };
    const encoded = encodeDAP(msg);
    const buffer = Buffer.from(encoded, "utf8");
    const { messages } = decodeDAP(buffer);
    expect(messages.length).toBe(1);
    expect((messages[0] as any).body.output).toBe("héllo 🌍");
  });
});
