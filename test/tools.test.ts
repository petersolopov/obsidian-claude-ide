import { describe, it } from "node:test";
import assert from "node:assert";
import { handleRpcMessage } from "../src/tools.ts";
import type { ToolContext, RpcMessage } from "../src/tools.ts";

const ctx = { app: {} as ToolContext["app"], latestSelection: null };

function rpc(
  method: string,
  params?: Record<string, unknown>,
): RpcMessage {
  return { jsonrpc: "2.0", id: 1, method, params };
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
    assert.strictEqual(info.name, "obsidian-claude-ide");
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
    assert.ok(names.includes("openFile"));
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
