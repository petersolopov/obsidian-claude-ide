import { Plugin, FileSystemAdapter } from "obsidian";
import { log } from "./log.ts";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { randomUUID } from "node:crypto";
import { createIdeServer, type IdeServer } from "./server.ts";
import { createLockFile, removeLockFile, cleanStaleLockFiles } from "./lock.ts";
import {
  handleRpcMessage,
  getSelectionData,
  buildAtMentionParams,
  type SelectionData,
} from "./tools.ts";

export default class ObsidianIdePlugin extends Plugin {
  private server: IdeServer | null = null;
  private port = 0;
  private latestSelection: SelectionData | null = null;
  private prevState: string | null = null;
  // Obsidian exposes activeWindow as a global; the npm types do not export it as ESM.
  private broadcastTimer: ReturnType<typeof activeWindow.setTimeout> | null = null;
  private broadcastTimerWindow: Window | null = null;

  async onload() {
    cleanStaleLockFiles();

    const authToken = randomUUID();
    const basePath = (
      this.app.vault.adapter as FileSystemAdapter
    ).getBasePath();

    this.server = createIdeServer({
      authToken,
      onMessage: (msg) =>
        handleRpcMessage(msg, {
          app: this.app,
          version: this.manifest.version,
          latestSelection: this.latestSelection,
        }),
    });

    this.port = await this.server.start();

    createLockFile({
      port: this.port,
      pid: process.pid,
      workspaceFolders: [basePath],
      authToken,
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.scheduleBroadcast();
      }),
    );

    // visibilitychange won't fire on macOS when window is visible but unfocused (e.g., side by side with terminal)
    this.registerDomEvent(activeWindow, "focus", () => {
      // reset dedup so broadcastSelection() sends even if cursor hasn't moved —
      // a new CLI session may have connected while the user was away
      this.prevState = null;
      this.scheduleBroadcast();
    });

    this.registerEditorExtension(
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.selectionSet || update.docChanged) {
          this.scheduleBroadcast();
        }
      }),
    );

    this.addCommand({
      id: "send-to-claude",
      name: "Send to Claude",
      editorCallback: () => {
        const data = getSelectionData(this.app);
        if (!data) return;

        this.server?.broadcast({
          jsonrpc: "2.0",
          method: "at_mentioned",
          params: buildAtMentionParams(data),
        });
      },
    });

    log("debug", `v${this.manifest.version} listening on 127.0.0.1:${this.port}`);
  }

  onunload() {
    if (this.broadcastTimer !== null) {
      this.broadcastTimerWindow?.clearTimeout(this.broadcastTimer);
      this.broadcastTimer = null;
      this.broadcastTimerWindow = null;
    }
    this.server?.stop();
    if (this.port) {
      removeLockFile(this.port);
    }
  }

  private scheduleBroadcast() {
    if (this.broadcastTimer !== null) {
      this.broadcastTimerWindow?.clearTimeout(this.broadcastTimer);
    }
    const timerWindow = activeWindow;
    this.broadcastTimerWindow = timerWindow;
    this.broadcastTimer = timerWindow.setTimeout(() => {
      this.broadcastTimer = null;
      this.broadcastTimerWindow = null;
      this.broadcastSelection();
    }, 100);
  }

  private broadcastSelection() {
    const data = getSelectionData(this.app);
    if (!data) return;

    this.latestSelection = data;

    const stateKey = JSON.stringify({
      filePath: data.filePath,
      cursor: data.cursor,
      selection: data.selection,
    });

    if (stateKey === this.prevState) return;
    this.prevState = stateKey;

    this.server?.broadcast({
      jsonrpc: "2.0",
      method: "selection_changed",
      params: {
        text: data.selection.text,
        filePath: data.filePath,
        fileUrl: "file://" + data.filePath,
        selection: {
          start: data.selection.start,
          end: data.selection.end,
          isEmpty: data.selection.isEmpty,
        },
      },
    });
  }
}
