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

const LOCK_DIR = join(homedir(), ".claude", "ide");

export interface LockFileData {
  port: number;
  pid: number;
  workspaceFolders: string[];
  authToken: string;
}

export function createLockFile(data: LockFileData): string {
  mkdirSync(LOCK_DIR, { recursive: true });
  const lockPath = join(LOCK_DIR, `${data.port}.lock`);
  const tmpPath = lockPath + ".tmp";
  const content = JSON.stringify({
    pid: data.pid,
    workspaceFolders: data.workspaceFolders,
    ideName: "Obsidian",
    transport: "ws",
    authToken: data.authToken,
  });
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, lockPath);
  return lockPath;
}

export function removeLockFile(port: number): void {
  try {
    unlinkSync(join(LOCK_DIR, `${port}.lock`));
  } catch {
    // already removed
  }
}

export function cleanStaleLockFiles(): void {
  let files: string[];
  try {
    files = readdirSync(LOCK_DIR).filter((f) => f.endsWith(".lock"));
  } catch {
    return;
  }
  for (const file of files) {
    const lockPath = join(LOCK_DIR, file);
    try {
      const data = JSON.parse(readFileSync(lockPath, "utf-8"));
      if (data.ideName !== "Obsidian") continue;
      if (data.pid === process.pid) throw new Error("own stale lock");
      process.kill(data.pid, 0); // throws if dead
    } catch {
      try {
        unlinkSync(lockPath);
      } catch {
        // ignore
      }
    }
  }
}
