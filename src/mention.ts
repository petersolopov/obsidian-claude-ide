import type { SelectionData } from "./tools.ts";

interface AtMentionParams {
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
}

export function buildAtMentionParams(data: SelectionData): AtMentionParams {
  if (data.selection.isEmpty) {
    return { filePath: data.filePath };
  }
  return {
    filePath: data.filePath,
    lineStart: data.selection.start.line,
    lineEnd: data.selection.end.line,
  };
}
