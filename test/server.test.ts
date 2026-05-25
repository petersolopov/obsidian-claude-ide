import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { connect, Socket } from "node:net";
import { randomBytes } from "node:crypto";
import { createIdeServer } from "../src/server.ts";
import type { IdeServer } from "../src/server.ts";
import { parseFrame, OPCODE } from "../src/websocket.ts";

const AUTH_TOKEN = "test-token-123";
const originalActiveWindow = activeWindow;

function setActiveWindowForTest(window: Window) {
  (globalThis as typeof globalThis & { activeWindow: Window }).activeWindow =
    window;
}

function createIntervalWindow() {
  const intervals: number[] = [];
  const clearedIntervals: number[] = [];
  let nextInterval = 1;

  const window = {
    setInterval: () => {
      const interval = nextInterval;
      nextInterval += 1;
      intervals.push(interval);
      return interval;
    },
    clearInterval: (interval: number) => {
      clearedIntervals.push(interval);
    },
  } as unknown as Window;

  return { window, intervals, clearedIntervals };
}

function createMaskedFrame(opcode: number, data: string | Buffer): Buffer {
  const payload = typeof data === "string" ? Buffer.from(data) : data;
  const maskKey = randomBytes(4);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    masked[i] = payload[i] ^ maskKey[i % 4];
  }

  let header: Buffer;
  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | payload.length;
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }

  return Buffer.concat([header, maskKey, masked]);
}

function connectWebSocket(
  port: number,
  token: string,
): Promise<{ socket: Socket; response: string }> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => {
      const wsKey = randomBytes(16).toString("base64");
      const request =
        "GET / HTTP/1.1\r\n" +
        "Host: 127.0.0.1\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Key: ${wsKey}\r\n` +
        "Sec-WebSocket-Version: 13\r\n" +
        `X-Claude-Code-Ide-Authorization: ${token}\r\n` +
        "\r\n";
      socket.write(request);
    });

    let httpBuffer = "";
    const onData = (chunk: Buffer) => {
      httpBuffer += chunk.toString();
      if (httpBuffer.includes("\r\n\r\n")) {
        socket.removeListener("data", onData);
        resolve({ socket, response: httpBuffer });
      }
    };

    socket.on("data", onData);
    socket.on("error", reject);
  });
}

function waitForFrame(socket: Socket): Promise<ReturnType<typeof parseFrame>> {
  return new Promise((resolve) => {
    let buffer = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const frame = parseFrame(buffer);
      if (frame) {
        socket.removeListener("data", onData);
        resolve(frame);
      }
    };
    socket.on("data", onData);
  });
}

describe("ide server", () => {
  let server: IdeServer;
  let sockets: Socket[] = [];

  afterEach(() => {
    for (const s of sockets) {
      s.destroy();
    }
    sockets = [];
    server?.stop();
    setActiveWindowForTest(originalActiveWindow);
  });

  it("accepts WebSocket connection and responds to initialize RPC", async () => {
    server = createIdeServer({
      authToken: AUTH_TOKEN,
      onMessage(msg) {
        return {
          jsonrpc: "2.0",
          id: msg.id,
          result: { protocolVersion: "2025-03-26" },
        };
      },
    });

    const port = await server.start();
    const { socket, response } = await connectWebSocket(port, AUTH_TOKEN);
    sockets.push(socket);

    assert.ok(response.startsWith("HTTP/1.1 101"));

    const rpcRequest = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26" },
    });
    socket.write(createMaskedFrame(OPCODE.TEXT, rpcRequest));

    const frame = await waitForFrame(socket);
    assert.ok(frame);
    assert.strictEqual(frame.opcode, OPCODE.TEXT);

    const rpcResponse = JSON.parse(frame.payload.toString());
    assert.strictEqual(rpcResponse.jsonrpc, "2.0");
    assert.strictEqual(rpcResponse.id, 1);
    assert.strictEqual(rpcResponse.result.protocolVersion, "2025-03-26");
  });

  it("broadcasts to multiple clients", async () => {
    server = createIdeServer({
      authToken: AUTH_TOKEN,
      onMessage: (msg) => ({ jsonrpc: "2.0", id: msg.id, result: {} }),
    });

    const port = await server.start();
    const { socket: s1 } = await connectWebSocket(port, AUTH_TOKEN);
    const { socket: s2 } = await connectWebSocket(port, AUTH_TOKEN);
    sockets.push(s1, s2);

    const p1 = waitForFrame(s1);
    const p2 = waitForFrame(s2);
    server.broadcast({ jsonrpc: "2.0", method: "test" });

    const [f1, f2] = await Promise.all([p1, p2]);
    assert.ok(f1);
    assert.ok(f2);
    const d1 = JSON.parse(f1.payload.toString());
    const d2 = JSON.parse(f2.payload.toString());
    assert.strictEqual(d1.method, "test");
    assert.strictEqual(d2.method, "test");
  });

  it("removes client after close frame", async () => {
    server = createIdeServer({
      authToken: AUTH_TOKEN,
      onMessage: (msg) => ({ jsonrpc: "2.0", id: msg.id, result: {} }),
    });

    const port = await server.start();
    const { socket: s1 } = await connectWebSocket(port, AUTH_TOKEN);
    const { socket: s2 } = await connectWebSocket(port, AUTH_TOKEN);
    sockets.push(s1, s2);

    const closeReply = waitForFrame(s1);
    s1.write(createMaskedFrame(OPCODE.CLOSE, Buffer.alloc(0)));
    const frame = await closeReply;
    assert.ok(frame);
    assert.strictEqual(frame.opcode, OPCODE.CLOSE);

    const p2 = waitForFrame(s2);
    server.broadcast({ jsonrpc: "2.0", method: "after_close" });
    const f2 = await p2;
    assert.strictEqual(JSON.parse(f2!.payload.toString()).method, "after_close");
  });

  it("returns RPC parse error for invalid JSON", async () => {
    server = createIdeServer({
      authToken: AUTH_TOKEN,
      onMessage: () => ({ jsonrpc: "2.0", id: null, result: {} }),
    });

    const port = await server.start();
    const { socket } = await connectWebSocket(port, AUTH_TOKEN);
    sockets.push(socket);

    socket.write(createMaskedFrame(OPCODE.TEXT, "not json{{{"));
    const frame = await waitForFrame(socket);
    assert.ok(frame);
    assert.strictEqual(frame.opcode, OPCODE.TEXT);

    const rpcError = JSON.parse(frame.payload.toString());
    assert.strictEqual(rpcError.jsonrpc, "2.0");
    assert.strictEqual(rpcError.id, null);
    assert.strictEqual(rpcError.error.code, -32700);
    assert.strictEqual(rpcError.error.message, "Parse error");
  });

  it("responds to ping with pong", async () => {
    server = createIdeServer({
      authToken: AUTH_TOKEN,
      onMessage: () => ({}),
    });

    const port = await server.start();
    const { socket } = await connectWebSocket(port, AUTH_TOKEN);
    sockets.push(socket);

    const pingPayload = Buffer.from("heartbeat");
    socket.write(createMaskedFrame(OPCODE.PING, pingPayload));
    const frame = await waitForFrame(socket);
    assert.ok(frame);
    assert.strictEqual(frame.opcode, OPCODE.PONG);
    assert.strictEqual(frame.payload.toString(), "heartbeat");
  });

  it("clears ping interval with the window that created it", async () => {
    const firstWindow = createIntervalWindow();
    const secondWindow = createIntervalWindow();
    setActiveWindowForTest(firstWindow.window);

    server = createIdeServer({
      authToken: AUTH_TOKEN,
      onMessage: () => ({}),
    });

    await server.start();
    setActiveWindowForTest(secondWindow.window);
    server.stop();

    assert.deepStrictEqual(firstWindow.intervals, [1]);
    assert.deepStrictEqual(firstWindow.clearedIntervals, [1]);
    assert.deepStrictEqual(secondWindow.clearedIntervals, []);
  });

  it("rejects connection with wrong auth token", async () => {
    server = createIdeServer({
      authToken: AUTH_TOKEN,
      onMessage() {
        return {};
      },
    });

    const port = await server.start();

    const response = await new Promise<string>((resolve, reject) => {
      const socket = connect(port, "127.0.0.1", () => {
        const wsKey = randomBytes(16).toString("base64");
        const request =
          "GET / HTTP/1.1\r\n" +
          "Host: 127.0.0.1\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          `Sec-WebSocket-Key: ${wsKey}\r\n` +
          "Sec-WebSocket-Version: 13\r\n" +
          "X-Claude-Code-Ide-Authorization: wrong-token\r\n" +
          "\r\n";
        socket.write(request);
      });

      sockets.push(socket);
      let data = "";
      socket.on("data", (chunk) => {
        data += chunk.toString();
      });
      socket.on("close", () => resolve(data));
      socket.on("error", reject);
    });

    assert.ok(response.startsWith("HTTP/1.1 401"));
  });
});
