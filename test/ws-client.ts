import { connect, Socket } from "node:net";
import { randomBytes } from "node:crypto";
import { parseFrame } from "../src/websocket.ts";

export function createMaskedFrame(opcode: number, data: string | Buffer): Buffer {
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

export function connectWebSocket(
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

export function waitForFrame(socket: Socket): Promise<ReturnType<typeof parseFrame>> {
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
