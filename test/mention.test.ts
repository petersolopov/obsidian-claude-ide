import { describe, it } from "node:test";
import assert from "node:assert";
import { buildAtMentionParams } from "../src/tools.ts";
import type { SelectionData } from "../src/tools.ts";

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
      filePath: "/vault/test.md",
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
      filePath: "/vault/note.md",
    });
  });
});
