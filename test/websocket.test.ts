import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseFrame,
  createFrame,
  computeAcceptKey,
  OPCODE,
} from "../src/websocket.ts";

describe("computeAcceptKey", () => {
  it("returns correct key for Claude Code GUID", () => {
    const key = "dGhlIHNhbXBsZSBub25jZQ==";
    const expected = "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=";
    assert.strictEqual(computeAcceptKey(key), expected);
  });
});

describe("createFrame + parseFrame", () => {
  it("roundtrips text frame", () => {
    const data = "hello world";
    const frame = createFrame(OPCODE.TEXT, data);
    const parsed = parseFrame(frame);
    assert.ok(parsed);
    assert.strictEqual(parsed.opcode, OPCODE.TEXT);
    assert.strictEqual(parsed.payload.toString(), data);
    assert.strictEqual(parsed.fin, true);
  });

  it("roundtrips medium payload (126-65535 bytes)", () => {
    const data = "x".repeat(1000);
    const frame = createFrame(OPCODE.TEXT, data);
    const parsed = parseFrame(frame);
    assert.ok(parsed);
    assert.strictEqual(parsed.payload.toString(), data);
    assert.strictEqual(parsed.totalLength, frame.length);
  });

  it("roundtrips empty payload (ping/pong)", () => {
    const frame = createFrame(OPCODE.PING, Buffer.alloc(0));
    const parsed = parseFrame(frame);
    assert.ok(parsed);
    assert.strictEqual(parsed.opcode, OPCODE.PING);
    assert.strictEqual(parsed.payload.length, 0);
  });
});

describe("parseFrame", () => {
  it("parses masked frame (client to server)", () => {
    const payload = Buffer.from("Hi");
    const maskKey = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      masked[i] = payload[i] ^ maskKey[i % 4];
    }
    const frame = Buffer.alloc(2 + 4 + payload.length);
    frame[0] = 0x81; // FIN + TEXT
    frame[1] = 0x80 | payload.length; // MASK bit + length
    maskKey.copy(frame, 2);
    masked.copy(frame, 6);

    const parsed = parseFrame(frame);
    assert.ok(parsed);
    assert.strictEqual(parsed.payload.toString(), "Hi");
  });

  it("returns null for incomplete data (1 byte)", () => {
    assert.strictEqual(parseFrame(Buffer.from([0x81])), null);
  });

  it("returns null when payload not fully received", () => {
    const frame = Buffer.alloc(3);
    frame[0] = 0x81; // FIN + TEXT
    frame[1] = 10; // payload length 10
    frame[2] = 0x41; // only 1 byte of payload
    assert.strictEqual(parseFrame(frame), null);
  });
});
