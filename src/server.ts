import { createServer as createTcpServer, Server, Socket } from "node:net";
import { computeAcceptKey, parseFrame, createFrame, OPCODE } from "./websocket";

interface Client {
  socket: Socket;
  buffer: Buffer;
  alive: boolean;
}

export interface BridgeServer {
  start(): Promise<number>;
  stop(): void;
  broadcast(data: object): void;
}

interface ServerOptions {
  authToken: string;
  onMessage(msg: Record<string, unknown>): Record<string, unknown>;
}

export function createBridgeServer(options: ServerOptions): BridgeServer {
  const clients = new Set<Client>();
  let server: Server | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  function parseHttpHeaders(data: string): Record<string, string> {
    const headers: Record<string, string> = {};
    const lines = data.split("\r\n");
    for (let i = 1; i < lines.length; i++) {
      const colonIdx = lines[i].indexOf(":");
      if (colonIdx === -1) continue;
      const key = lines[i].substring(0, colonIdx).trim().toLowerCase();
      const value = lines[i].substring(colonIdx + 1).trim();
      headers[key] = value;
    }
    return headers;
  }

  function handleUpgrade(socket: Socket, headers: Record<string, string>) {
    if (headers["x-claude-code-ide-authorization"] !== options.authToken) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const wsKey = headers["sec-websocket-key"];
    if (!wsKey) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    const acceptKey = computeAcceptKey(wsKey);
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
        "\r\n",
    );

    const client: Client = { socket, buffer: Buffer.alloc(0), alive: true };
    clients.add(client);

    socket.on("data", (data) => {
      client.buffer = Buffer.concat([client.buffer, data]);
      processFrames(client);
    });

    socket.on("close", () => clients.delete(client));
    socket.on("error", () => clients.delete(client));
  }

  function processFrames(client: Client) {
    while (true) {
      const frame = parseFrame(client.buffer);
      if (!frame) break;
      client.buffer = client.buffer.subarray(frame.totalLength);

      if (frame.opcode === OPCODE.PING) {
        client.socket.write(createFrame(OPCODE.PONG, frame.payload));
      } else if (frame.opcode === OPCODE.PONG) {
        client.alive = true;
      } else if (frame.opcode === OPCODE.CLOSE) {
        client.socket.write(createFrame(OPCODE.CLOSE, Buffer.alloc(0)));
        client.socket.destroy();
        clients.delete(client);
        break;
      } else if (frame.opcode === OPCODE.TEXT) {
        try {
          const msg = JSON.parse(frame.payload.toString());
          if (msg.id === undefined || msg.id === null) continue;
          const response = options.onMessage(msg);
          client.socket.write(
            createFrame(OPCODE.TEXT, JSON.stringify(response)),
          );
        } catch {
          // malformed message
        }
      }
    }
  }

  return {
    start(): Promise<number> {
      return new Promise((resolve) => {
        server = createTcpServer((socket) => {
          let httpBuffer = "";

          const onData = (chunk: Buffer) => {
            httpBuffer += chunk.toString();
            if (!httpBuffer.includes("\r\n\r\n")) return;
            socket.removeListener("data", onData);
            const headers = parseHttpHeaders(httpBuffer);

            if (headers["upgrade"]?.toLowerCase() !== "websocket") {
              socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
              socket.destroy();
              return;
            }

            handleUpgrade(socket, headers);
          };

          socket.on("data", onData);
        });

        server.listen(0, "127.0.0.1", () => {
          const addr = server!.address() as { port: number };

          pingInterval = setInterval(() => {
            for (const client of clients) {
              if (!client.alive) {
                client.socket.destroy();
                clients.delete(client);
                continue;
              }
              client.alive = false;
              client.socket.write(createFrame(OPCODE.PING, Buffer.alloc(0)));
            }
          }, 30_000);

          resolve(addr.port);
        });
      });
    },

    stop() {
      if (pingInterval) clearInterval(pingInterval);
      for (const client of clients) {
        client.socket.destroy();
      }
      clients.clear();
      server?.close();
    },

    broadcast(data: object) {
      const frame = createFrame(OPCODE.TEXT, JSON.stringify(data));
      for (const client of clients) {
        client.socket.write(frame);
      }
    },
  };
}
