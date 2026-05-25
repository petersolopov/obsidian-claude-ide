import {
  writeFileSync,
  renameSync,
  unlinkSync,
  readdirSync,
  readFileSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_LOCK_DIR = join(homedir(), ".claude", "ide");

export interface LockFileData {
  port: number;
  pid: number;
  workspaceFolders: string[];
  authToken: string;
}

type ExistingLockFile =
  | { status: "obsidian"; pid: number }
  | { status: "foreign" }
  | { status: "corrupt" };

function parseExistingLockFile(content: string): ExistingLockFile {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    return { status: "corrupt" };
  }

  const isObject = typeof parsedJson === "object";
  const hasValue = parsedJson !== null;
  const isRecord = isObject && hasValue && !Array.isArray(parsedJson);
  if (!isRecord) {
    return { status: "corrupt" };
  }

  const data = parsedJson as Record<string, unknown>;
  const isObsidianLock = data.ideName === "Obsidian";
  if (!isObsidianLock) {
    return { status: "foreign" };
  }

  const pid = data.pid;
  const hasNumericPid = typeof pid === "number";
  if (!hasNumericPid) {
    return { status: "corrupt" };
  }

  const hasValidPid = Number.isSafeInteger(pid) && pid > 0;
  if (!hasValidPid) {
    return { status: "corrupt" };
  }

  return { status: "obsidian", pid };
}

export function createLockFile(
  data: LockFileData,
  lockDir: string = DEFAULT_LOCK_DIR,
): string {
  mkdirSync(lockDir, { recursive: true });
  const lockPath = join(lockDir, `${data.port}.lock`);
  const tmpPath = lockPath + ".tmp";
  const content = JSON.stringify({
    pid: data.pid,
    workspaceFolders: data.workspaceFolders,
    ideName: "Obsidian",
    transport: "ws",
    authToken: data.authToken,
  });
  writeFileSync(tmpPath, content, { mode: 0o600 });
  renameSync(tmpPath, lockPath);
  return lockPath;
}

export function removeLockFile(
  port: number,
  lockDir: string = DEFAULT_LOCK_DIR,
): void {
  try {
    unlinkSync(join(lockDir, `${port}.lock`));
  } catch {
    // already removed
  }
}

export function cleanStaleLockFiles(
  lockDir: string = DEFAULT_LOCK_DIR,
): void {
  let files: string[];
  try {
    files = readdirSync(lockDir).filter((f) => f.endsWith(".lock"));
  } catch {
    return;
  }
  for (const file of files) {
    const lockPath = join(lockDir, file);
    try {
      const content = readFileSync(lockPath, "utf-8");
      const lockFile = parseExistingLockFile(content);
      if (lockFile.status === "foreign") continue;
      if (lockFile.status === "corrupt") throw new Error("corrupt lock");
      if (lockFile.pid === process.pid) throw new Error("own stale lock");
      process.kill(lockFile.pid, 0); // throws if dead
    } catch {
      try {
        unlinkSync(lockPath);
      } catch {
        // ignore
      }
    }
  }
}
