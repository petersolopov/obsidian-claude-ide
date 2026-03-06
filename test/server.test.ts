import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { connect, Socket } from "node:net";
import { randomBytes } from "node:crypto";
import { createBridgeServer } from "../src/server.ts";
import type { BridgeServer } from "../src/server.ts";
import { parseFrame, OPCODE } from "../src/websocket.ts";

const AUTH_TOKEN = "test-token-123";

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

describe("bridge server", () => {
  let server: BridgeServer;
  let sockets: Socket[] = [];

  afterEach(() => {
    for (const s of sockets) {
      s.destroy();
    }
    sockets = [];
    server?.stop();
  });

  it("accepts WebSocket connection and responds to initialize RPC", async () => {
    server = createBridgeServer({
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

  it("rejects connection with wrong auth token", async () => {
    server = createBridgeServer({
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
