import { createHash } from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export const OPCODE = {
  TEXT: 0x1,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xa,
} as const;

export interface Frame {
  fin: boolean;
  opcode: number;
  payload: Buffer;
  totalLength: number;
}

export function computeAcceptKey(key: string): string {
  return createHash("sha1").update(key + GUID).digest("base64");
}

export function parseFrame(buffer: Buffer): Frame | null {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const fin = (firstByte & 0x80) !== 0;
  const opcode = firstByte & 0x0f;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) return null;
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return null;
    payloadLength = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  if (masked) {
    const maskKeyEnd = offset + 4;
    if (buffer.length < maskKeyEnd + payloadLength) return null;
    const maskKey = buffer.subarray(offset, maskKeyEnd);
    const payload = Buffer.alloc(payloadLength);
    for (let i = 0; i < payloadLength; i++) {
      payload[i] = buffer[maskKeyEnd + i] ^ maskKey[i % 4];
    }
    return { fin, opcode, payload, totalLength: maskKeyEnd + payloadLength };
  }

  if (buffer.length < offset + payloadLength) return null;
  const payload = buffer.subarray(offset, offset + payloadLength);
  return { fin, opcode, payload, totalLength: offset + payloadLength };
}

export function createFrame(opcode: number, data: string | Buffer): Buffer {
  const payload = typeof data === "string" ? Buffer.from(data) : data;
  const length = payload.length;

  let header: Buffer;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  return Buffer.concat([header, payload]);
}
