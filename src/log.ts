const debug = Boolean(process.env.OBSIDIAN_IDE_DEBUG);

export function log(level: "debug" | "error", ...args: unknown[]) {
  if (level !== "error" && !debug) {
    return;
  }
  const fn = level === "error" ? console.error : console.log;
  fn("[claude-code-ide]", ...args);
}
