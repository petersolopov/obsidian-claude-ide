import { Plugin, FileSystemAdapter, MarkdownView } from "obsidian";
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
  private lastMarkdownView: MarkdownView | null = null;
  private broadcastTimer: number | null = null;

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
      onClientReady: (sendToClient) => {
        const selection = this.getLastMarkdownViewSelection();
        if (selection) sendToClient(selectionChangedMessage(selection));
        // a session that got nothing must hear the next editor event even if nothing changed
        else this.prevState = null;
      },
    });

    this.port = await this.server.start();

    createLockFile({
      port: this.port,
      pid: process.pid,
      workspaceFolders: [basePath],
      authToken,
    });

    // at startup the tabs come back after plugins load, so the note open then is seen here
    this.app.workspace.onLayoutReady(() => this.rememberMarkdownView());

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.rememberMarkdownView();
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
      window.clearTimeout(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    this.server?.stop();
    if (this.port) {
      removeLockFile(this.port);
    }
  }

  // the main area's last leaf, not the active one: a sidebar terminal may be active, also when the
  // plugin loads; a terminal, graph or empty tab is no note, so the last note stays remembered.
  // Obsidian does not restore activeTime, so after a restart the first visible leaf counts as the last
  private rememberMarkdownView() {
    const view = this.app.workspace.getMostRecentLeaf()?.view;
    if (view instanceof MarkdownView) this.lastMarkdownView = view;
  }

  private scheduleBroadcast() {
    if (this.broadcastTimer !== null) {
      window.clearTimeout(this.broadcastTimer);
    }
    this.broadcastTimer = window.setTimeout(() => {
      this.broadcastTimer = null;
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

    this.server?.broadcast(selectionChangedMessage(data));
  }

  private getLastMarkdownViewSelection(): SelectionData | null {
    const view =
      this.app.workspace.getActiveViewOfType(MarkdownView) ?? this.lastMarkdownView;
    if (!view) return null;
    if (!view.containerEl.isShown()) return null;
    return getSelectionData(this.app, view);
  }
}

function selectionChangedMessage(data: SelectionData) {
  return {
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
  };
}
