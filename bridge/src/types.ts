// DAP JSON-RPC framing types for stdio transport.

export interface DAPMessage {
  type: "request" | "response" | "event";
  seq: number;
}

export interface DAPRequest extends DAPMessage {
  type: "request";
  command: string;
  arguments?: Record<string, unknown>;
}

export interface DAPResponse extends DAPMessage {
  type: "response";
  request_seq: number;
  command: string;
  success: boolean;
  body?: unknown;
  message?: string;
}

export interface DAPEvent extends DAPMessage {
  type: "event";
  event: string;
  body?: unknown;
}

export function encodeDAP(msg: unknown): string {
  const json = JSON.stringify(msg);
  const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;
  return header + json;
}

export function decodeDAP(buffer: Buffer): { messages: (DAPRequest | DAPResponse | DAPEvent)[]; remaining: Buffer } {
  const messages: (DAPRequest | DAPResponse | DAPEvent)[] = [];
  let remaining = buffer;

  while (true) {
    const headerEnd = remaining.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;

    const header = remaining.slice(0, headerEnd).toString("utf8");
    const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!lengthMatch) {
      remaining = remaining.slice(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(lengthMatch[1], 10);
    const totalLength = headerEnd + 4 + contentLength;

    if (remaining.length < totalLength) break;

    const body = remaining.slice(headerEnd + 4, totalLength).toString("utf8");
    remaining = remaining.slice(totalLength);

    try {
      const parsed = JSON.parse(body) as DAPRequest | DAPResponse | DAPEvent;
      messages.push(parsed);
    } catch {
      // Skip malformed JSON
    }
  }

  return { messages, remaining };
}
