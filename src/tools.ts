import { type App, MarkdownView, type FileSystemAdapter } from "obsidian";

interface Position {
  line: number;
  character: number;
}

export interface SelectionData {
  filePath: string;
  relativePath: string;
  cursor: Position;
  selection: {
    start: Position;
    end: Position;
    isEmpty: boolean;
    text: string;
  };
}

export interface ToolContext {
  app: App;
  version: string;
  latestSelection: SelectionData | null;
}

const TOOL_SCHEMAS = [
  {
    name: "getCurrentSelection",
    description: "Get the current selection in the active editor",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "getLatestSelection",
    description: "Get the most recent selection (cached from last change)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "getOpenEditors",
    description: "Get all open editor tabs",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "getWorkspaceFolders",
    description: "Get workspace folder paths",
    inputSchema: { type: "object", properties: {} },
  },
];

const STUB_HANDLERS: Record<string, () => object> = {
  openDiff: () => ({ success: false }),
  getDiagnostics: () => ({ diagnostics: [] }),
  checkDocumentDirty: () => ({ isDirty: false }),
  saveDocument: () => ({ success: true }),
  close_tab: () => ({ success: false }),
  closeAllDiffTabs: () => ({ success: true }),
  executeCode: () => ({ success: false }),
};

function getBasePath(app: App): string {
  return (app.vault.adapter as FileSystemAdapter).getBasePath();
}

interface AtMentionParams {
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
}

export function buildAtMentionParams(data: SelectionData): AtMentionParams {
  // CLI doesn't handle spaces in filePath — quote to match @"file name.md" syntax
  const filePath = data.relativePath.includes(" ")
    ? `"${data.relativePath}"`
    : data.relativePath;

  if (data.selection.isEmpty) {
    return { filePath };
  }
  return {
    filePath,
    // protocol uses 0-based lines; Obsidian getCursor() is already 0-based
    lineStart: data.selection.start.line,
    lineEnd: data.selection.end.line,
  };
}

export function getSelectionData(app: App): SelectionData | null {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view?.file) return null;
  const editor = view.editor;
  const basePath = getBasePath(app);
  const cursor = editor.getCursor();
  const from = editor.getCursor("from");
  const to = editor.getCursor("to");
  const selectedText = editor.getSelection();

  return {
    filePath: basePath + "/" + view.file.path,
    relativePath: view.file.path,
    cursor: { line: cursor.line, character: cursor.ch },
    selection: {
      start: { line: from.line, character: from.ch },
      end: { line: to.line, character: to.ch },
      isEmpty: selectedText === "",
      text: selectedText,
    },
  };
}

function toolResult(
  data: object,
  isError = false,
): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  const result: {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  } = {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
  if (isError) result.isError = true;
  return result;
}

function handleToolCall(name: string, ctx: ToolContext) {
  switch (name) {
    case "getCurrentSelection": {
      const data = getSelectionData(ctx.app);
      if (!data) return toolResult({ error: "no active file" });
      return toolResult(data);
    }
    case "getLatestSelection": {
      if (!ctx.latestSelection)
        return toolResult({ error: "no selection tracked yet" });
      return toolResult(ctx.latestSelection);
    }
    case "getOpenEditors": {
      const basePath = getBasePath(ctx.app);
      const leaves = ctx.app.workspace.getLeavesOfType("markdown");
      const activeView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
      const tabs = leaves
        .filter((l) => (l.view as MarkdownView).file)
        .map((l) => {
          const file = (l.view as MarkdownView).file!;
          return {
            uri: "file://" + basePath + "/" + file.path,
            isActive: l.view === activeView,
            label: file.basename,
            languageId: "markdown",
          };
        });
      return toolResult({ tabs });
    }
    case "getWorkspaceFolders": {
      return toolResult({ folders: [getBasePath(ctx.app)] });
    }
    default: {
      if (name in STUB_HANDLERS) {
        return toolResult(STUB_HANDLERS[name]());
      }
      return null;
    }
  }
}

export interface RpcMessage {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export function handleRpcMessage(
  msg: RpcMessage,
  ctx: ToolContext,
): Record<string, unknown> {
  switch (msg.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion:
            (msg.params?.protocolVersion as string) || "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: {
            name: "claude-code-ide",
            version: ctx.version,
          },
        },
      };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: { tools: TOOL_SCHEMAS },
      };

    case "tools/call": {
      const params = msg.params || {};
      const name = params.name as string;
      const result = handleToolCall(name, ctx);
      if (!result) {
        return {
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: -32601, message: `Tool not found: ${name}` },
        };
      }
      return { jsonrpc: "2.0", id: msg.id, result };
    }

    default:
      return {
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32601, message: "Method not found" },
      };
  }
}
