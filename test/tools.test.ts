import { describe, it } from "node:test";
import assert from "node:assert";
import { handleRpcMessage, buildAtMentionParams } from "../src/tools.ts";
import type { ToolContext, RpcMessage, SelectionData } from "../src/tools.ts";

const ctx = {
  app: {} as ToolContext["app"],
  version: "0.0.0-test",
  latestSelection: null,
};

function rpc(
  method: string,
  params?: Record<string, unknown>,
): RpcMessage {
  const msg: RpcMessage = { jsonrpc: "2.0", id: 1, method };
  if (params) msg.params = params;
  return msg;
}

describe("handleRpcMessage", () => {
  it("initialize echoes protocolVersion", () => {
    const res = handleRpcMessage(
      rpc("initialize", { protocolVersion: "2025-03-26" }),
      ctx,
    );
    assert.strictEqual(res.id, 1);
    const result = res.result as Record<string, unknown>;
    assert.strictEqual(result.protocolVersion, "2025-03-26");
    const info = result.serverInfo as Record<string, string>;
    assert.strictEqual(info.name, "claude-code-ide");
    assert.strictEqual(info.version, "0.0.0-test");
  });

  it("initialize defaults protocolVersion", () => {
    const res = handleRpcMessage(rpc("initialize"), ctx);
    const result = res.result as Record<string, unknown>;
    assert.strictEqual(result.protocolVersion, "2025-03-26");
  });

  it("tools/list returns tool schemas", () => {
    const res = handleRpcMessage(rpc("tools/list"), ctx);
    const result = res.result as { tools: Array<{ name: string }> };
    const names = result.tools.map((t) => t.name);
    assert.ok(names.includes("getCurrentSelection"));
    assert.ok(names.includes("getOpenEditors"));
    assert.ok(names.includes("getWorkspaceFolders"));
  });

  it("unknown method returns error -32601", () => {
    const res = handleRpcMessage(rpc("nonexistent"), ctx);
    const error = res.error as { code: number; message: string };
    assert.strictEqual(error.code, -32601);
  });

  it("tools/call with unknown tool returns error", () => {
    const res = handleRpcMessage(
      rpc("tools/call", { name: "noSuchTool", arguments: {} }),
      ctx,
    );
    const error = res.error as { code: number };
    assert.strictEqual(error.code, -32601);
  });

  it("tools/call getLatestSelection with no selection", () => {
    const res = handleRpcMessage(
      rpc("tools/call", { name: "getLatestSelection", arguments: {} }),
      { ...ctx, latestSelection: null },
    );
    const result = res.result as {
      content: Array<{ text: string }>;
    };
    const data = JSON.parse(result.content[0].text);
    assert.ok(data.error);
  });

  it("tools/call getLatestSelection returns cached selection", () => {
    const selection = {
      filePath: "/vault/test.md",
      relativePath: "test.md",
      cursor: { line: 0, character: 0 },
      selection: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
        isEmpty: false,
        text: "hello",
      },
    };
    const res = handleRpcMessage(
      rpc("tools/call", { name: "getLatestSelection", arguments: {} }),
      { ...ctx, latestSelection: selection },
    );
    const result = res.result as {
      content: Array<{ text: string }>;
    };
    const data = JSON.parse(result.content[0].text);
    assert.strictEqual(data.selection.text, "hello");
  });

  it("tools/call stub handler getDiagnostics", () => {
    const res = handleRpcMessage(
      rpc("tools/call", { name: "getDiagnostics", arguments: {} }),
      ctx,
    );
    const result = res.result as {
      content: Array<{ text: string }>;
    };
    const data = JSON.parse(result.content[0].text);
    assert.deepStrictEqual(data.diagnostics, []);
  });

  it("tools/call stub handler saveDocument", () => {
    const res = handleRpcMessage(
      rpc("tools/call", { name: "saveDocument", arguments: {} }),
      ctx,
    );
    const result = res.result as {
      content: Array<{ text: string }>;
    };
    const data = JSON.parse(result.content[0].text);
    assert.strictEqual(data.success, true);
  });

  it("preserves message id", () => {
    const res = handleRpcMessage(
      { jsonrpc: "2.0", id: 42, method: "tools/list" },
      ctx,
    );
    assert.strictEqual(res.id, 42);
  });
});

describe("buildAtMentionParams", () => {
  it("returns filePath and line range for non-empty selection", () => {
    const data: SelectionData = {
      filePath: "/vault/test.md",
      relativePath: "test.md",
      cursor: { line: 5, character: 0 },
      selection: {
        start: { line: 3, character: 0 },
        end: { line: 7, character: 10 },
        isEmpty: false,
        text: "hello",
      },
    };
    const params = buildAtMentionParams(data);
    assert.deepStrictEqual(params, {
      filePath: "test.md",
      lineStart: 3,
      lineEnd: 7,
    });
  });

  it("returns only filePath for empty selection", () => {
    const data: SelectionData = {
      filePath: "/vault/note.md",
      relativePath: "note.md",
      cursor: { line: 0, character: 0 },
      selection: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
        isEmpty: true,
        text: "",
      },
    };
    const params = buildAtMentionParams(data);
    assert.deepStrictEqual(params, {
      filePath: "note.md",
    });
  });

  it("quotes filePath with spaces", () => {
    const data: SelectionData = {
      filePath: "/vault/mass-energy equivalence.md",
      relativePath: "mass-energy equivalence.md",
      cursor: { line: 0, character: 0 },
      selection: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
        isEmpty: true,
        text: "",
      },
    };
    const params = buildAtMentionParams(data);
    assert.deepStrictEqual(params, {
      filePath: '"mass-energy equivalence.md"',
    });
  });

  it("quotes filePath with spaces and line range", () => {
    const data: SelectionData = {
      filePath: "/vault/my folder/some note.md",
      relativePath: "my folder/some note.md",
      cursor: { line: 2, character: 0 },
      selection: {
        start: { line: 1, character: 0 },
        end: { line: 3, character: 5 },
        isEmpty: false,
        text: "selected",
      },
    };
    const params = buildAtMentionParams(data);
    assert.deepStrictEqual(params, {
      filePath: '"my folder/some note.md"',
      lineStart: 1,
      lineEnd: 3,
    });
  });
});
