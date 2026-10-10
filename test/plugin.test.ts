import { describe, it, after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Socket } from "node:net";
import { MarkdownView, type App } from "obsidian";
import { OPCODE } from "../src/websocket.ts";
import { createMaskedFrame, connectWebSocket, waitForFrame } from "./ws-client.ts";

// the plugin writes its lock file under the home directory; keep the test out of ~/.claude.
// os.homedir() reads HOME on POSIX and USERPROFILE on Windows, so set both before the import
const home = mkdtempSync(join(tmpdir(), "claude-code-ide-test-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
const { default: ObsidianIdePlugin } = await import("../src/main.ts");

interface Range {
  from: { line: number; ch: number };
  to: { line: number; ch: number };
  text: string;
}

function makeView(path: string, range: Range) {
  const view = {
    file: { path },
    range,
    shown: true,
    containerEl: { isShown: () => view.shown },
    editor: {
      getCursor(kind?: string) {
        return kind === "from" ? view.range.from : view.range.to;
      },
      getSelection() {
        return view.range.text;
      },
    },
  };
  return Object.setPrototypeOf(view, MarkdownView.prototype) as typeof view;
}

type FakeView = ReturnType<typeof makeView>;

const workspace = {
  handlers: new Map<string, () => void>(),
  activeView: null as FakeView | null,
  mainAreaLeaf: null as { view: FakeView } | null,
  on(name: string, handler: () => void) {
    this.handlers.set(name, handler);
    return {};
  },
  getActiveViewOfType() {
    return this.activeView;
  },
  getMostRecentLeaf() {
    return this.mainAreaLeaf;
  },
  onLayoutReady(callback: () => void) {
    callback();
  },
};

const app = {
  workspace,
  vault: { adapter: { getBasePath: () => "/vault" } },
} as unknown as App;

function activate(view: FakeView | null) {
  workspace.activeView = view;
  if (view) workspace.mainAreaLeaf = { view };
  workspace.handlers.get("active-leaf-change")?.();
}

function readLockFile() {
  const lockDir = join(home, ".claude", "ide");
  const [file] = readdirSync(lockDir).filter((f) => f.endsWith(".lock"));
  const lock = JSON.parse(readFileSync(join(lockDir, file), "utf-8"));
  return { port: Number(file.replace(".lock", "")), authToken: lock.authToken as string };
}

async function connectSession(sockets: Socket[]) {
  const { port, authToken } = readLockFile();
  const { socket } = await connectWebSocket(port, authToken);
  sockets.push(socket);
  const reply = waitForFrame(socket);
  const notification = JSON.stringify({ jsonrpc: "2.0", method: "ide_connected" });
  socket.write(createMaskedFrame(OPCODE.TEXT, notification));
  return reply;
}

function silenceAfter(ms: number) {
  return new Promise<string>((resolve) => setTimeout(() => resolve("silent"), ms));
}

after(() => rmSync(home, { recursive: true, force: true }));

describe("new session gets the last editor's selection", () => {
  const plugin = new ObsidianIdePlugin(app, { version: "0.0.0-test" } as never);
  const sockets: Socket[] = [];

  after(() => {
    for (const socket of sockets) socket.destroy();
    plugin.onunload();
  });

  it("sends the note open before load, read from the pane used last, while that pane is on screen", { timeout: 10_000 }, async () => {
    const noteA = makeView("a.md", {
      from: { line: 1, ch: 0 },
      to: { line: 2, ch: 5 },
      text: "two\nthree",
    });
    workspace.activeView = noteA;
    workspace.mainAreaLeaf = { view: noteA };
    await plugin.onload();

    workspace.mainAreaLeaf = { view: {} as FakeView }; // a terminal tab takes focus
    activate(null); // no editor event happened in between
    const first = await connectSession(sockets);
    assert.ok(first);
    const message = JSON.parse(first.payload.toString());
    assert.strictEqual(message.method, "selection_changed");
    assert.strictEqual(message.params.filePath, "/vault/a.md");
    assert.strictEqual(message.params.text, "two\nthree");

    const paneB = makeView("a.md", {
      from: { line: 0, ch: 0 },
      to: { line: 0, ch: 3 },
      text: "one",
    });
    activate(paneB);
    activate(null);
    const second = connectSession(sockets);
    // ide_connected is handled within a few ms; the selection changes before the 500 ms send
    await silenceAfter(150);
    paneB.range = { from: { line: 0, ch: 0 }, to: { line: 0, ch: 3 }, text: "ONE" };
    const frame = await second;
    assert.ok(frame);
    assert.strictEqual(JSON.parse(frame.payload.toString()).params.text, "ONE");

    activate(paneB); // the plugin broadcasts this state and remembers it as already sent
    await silenceAfter(150);
    paneB.shown = false; // closed, or covered by a terminal tab
    activate(null);
    const pending = connectSession(sockets);
    const third = await Promise.race([pending, silenceAfter(800)]);
    assert.strictEqual(third, "silent");

    // the user clicks the note tab again without moving the cursor: the state is unchanged,
    // yet this session has never seen it
    paneB.shown = true;
    activate(paneB);
    const late = await pending;
    assert.ok(late);
    assert.strictEqual(JSON.parse(late.payload.toString()).params.text, "ONE");
  });
});

describe("new session after a load while a terminal leaf is active", () => {
  const plugin = new ObsidianIdePlugin(app, { version: "0.0.0-test" } as never);
  const sockets: Socket[] = [];

  after(() => {
    for (const socket of sockets) socket.destroy();
    plugin.onunload();
  });

  it("sends the note used last in the main area", { timeout: 10_000 }, async () => {
    const note = makeView("c.md", {
      from: { line: 3, ch: 0 },
      to: { line: 3, ch: 4 },
      text: "four",
    });
    workspace.activeView = null;
    workspace.mainAreaLeaf = { view: note };
    await plugin.onload();

    const frame = await connectSession(sockets);
    assert.ok(frame);
    const message = JSON.parse(frame.payload.toString());
    assert.strictEqual(message.params.filePath, "/vault/c.md");
    assert.strictEqual(message.params.text, "four");
  });
});
