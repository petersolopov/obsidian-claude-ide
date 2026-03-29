declare const DEBUG: boolean;

export function log(level: "debug" | "error", ...args: unknown[]) {
  if (level !== "error" && !DEBUG) {
    return;
  }
  const fn = level === "error" ? console.error : console.debug;
  fn("[claude-code-ide]", ...args);
}
