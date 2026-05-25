import { createServer, Server } from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import { Socket } from "node:net";
import { computeAcceptKey, parseFrame, createFrame, OPCODE } from "./websocket.ts";
import type { RpcMessage } from "./tools.ts";
import { log } from "./log.ts";

interface Client {
  socket: Socket;
  buffer: Buffer;
  alive: boolean;
}

export interface IdeServer {
  start(): Promise<number>;
  stop(): void;
  broadcast(data: object): void;
}

interface ServerOptions {
  authToken: string;
  onMessage(msg: RpcMessage): Record<string, unknown>;
}

export function createIdeServer(options: ServerOptions): IdeServer {
  const clients = new Set<Client>();
  let server: Server | null = null;
  // Obsidian exposes activeWindow as a global; the npm types do not export it as ESM.
  let pingInterval: ReturnType<typeof activeWindow.setInterval> | null = null;
  let pingIntervalWindow: Window | null = null;

  function handleUpgrade(socket: Socket, headers: IncomingHttpHeaders) {
    log("debug", "upgrade headers:", JSON.stringify(headers));
    if (headers["x-claude-code-ide-authorization"] !== options.authToken) {
      log("debug", "auth FAIL, expected:", options.authToken, "got:", headers["x-claude-code-ide-authorization"]);
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    log("debug", "auth OK");

    const wsKey = headers["sec-websocket-key"];
    if (!wsKey || Array.isArray(wsKey)) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    const acceptKey = computeAcceptKey(wsKey);
    const protocol = headers["sec-websocket-protocol"];
    const upgradeResponse =
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
      (protocol ? `Sec-WebSocket-Protocol: ${protocol}\r\n` : "") +
      "\r\n";
    log("debug", "upgrade response:", JSON.stringify(upgradeResponse));
    socket.write(upgradeResponse);

    const client: Client = { socket, buffer: Buffer.alloc(0), alive: true };
    clients.add(client);

    socket.on("data", (data) => {
      client.buffer = Buffer.concat([client.buffer, data]);
      processFrames(client);
    });

    socket.on("close", () => { log("debug", "client disconnected"); clients.delete(client); });
    socket.on("error", (e) => { log("error", "client error:", e.message); clients.delete(client); });
  }

  function processFrames(client: Client) {
    while (true) {
      const frame = parseFrame(client.buffer);
      if (!frame) break;
      client.buffer = client.buffer.subarray(frame.totalLength);
      if (!client.socket.writable) break;

      if (frame.opcode === OPCODE.PING) {
        client.socket.write(createFrame(OPCODE.PONG, frame.payload));
      } else if (frame.opcode === OPCODE.PONG) {
        client.alive = true;
      } else if (frame.opcode === OPCODE.CLOSE) {
        client.socket.write(createFrame(OPCODE.CLOSE, Buffer.alloc(0)));
        client.socket.destroy();
        clients.delete(client);
        break;
      } else if (!frame.fin) {
        // fragmented frames not supported — Claude Code CLI never sends them
        log("error", "rejecting fragmented frame, opcode:", frame.opcode);
        client.socket.write(createFrame(OPCODE.CLOSE, Buffer.alloc(0)));
        client.socket.destroy();
        clients.delete(client);
        break;
      } else if (frame.opcode === OPCODE.TEXT) {
        try {
          const text = frame.payload.toString();
          log("debug", "recv:", text);
          const msg = JSON.parse(text) as RpcMessage;
          if (msg.id === undefined || msg.id === null) {
            log("debug", "skip notification (no id):", msg.method);
            continue;
          }
          const response = options.onMessage(msg);
          const responseText = JSON.stringify(response);
          log("debug", "send:", responseText);
          client.socket.write(createFrame(OPCODE.TEXT, responseText));
        } catch (e) {
          log("error", "error processing frame:", e);
          const isParseError = e instanceof SyntaxError;
          const rpcError = {
            jsonrpc: "2.0",
            id: null,
            error: isParseError
              ? { code: -32700, message: "Parse error" }
              : { code: -32603, message: "Internal error" },
          };
          client.socket.write(createFrame(OPCODE.TEXT, JSON.stringify(rpcError)));
        }
      }
    }
  }

  return {
    start(): Promise<number> {
      return new Promise((resolve, reject) => {
        server = createServer((_req, res) => {
          res.writeHead(400);
          res.end();
        });

        server.on("upgrade", (req, socket, head) => {
          const netSocket = socket as Socket;
          if (head.length > 0) {
            netSocket.unshift(head);
          }
          handleUpgrade(netSocket, req.headers);
        });

        server.on("error", (e) => {
          log("error", "server error:", e.message);
          reject(e);
        });

        server.listen(0, "127.0.0.1", () => {
          const addr = server!.address() as { port: number };

          const timerWindow = activeWindow;
          pingIntervalWindow = timerWindow;
          pingInterval = timerWindow.setInterval(() => {
            for (const client of clients) {
              if (!client.alive) {
                client.socket.destroy();
                clients.delete(client);
                continue;
              }
              client.alive = false;
              if (client.socket.writable) {
                client.socket.write(createFrame(OPCODE.PING, Buffer.alloc(0)));
              }
            }
          }, 30_000);

          resolve(addr.port);
        });
      });
    },

    stop() {
      if (pingInterval !== null) {
        pingIntervalWindow?.clearInterval(pingInterval);
        pingInterval = null;
        pingIntervalWindow = null;
      }
      for (const client of clients) {
        client.socket.destroy();
      }
      clients.clear();
      server?.close();
    },

    broadcast(data: object) {
      const text = JSON.stringify(data);
      log("debug", "broadcast:", text);
      const frame = createFrame(OPCODE.TEXT, text);
      for (const client of clients) {
        if (!client.socket.writable) continue;
        client.socket.write(frame);
      }
    },
  };
}
