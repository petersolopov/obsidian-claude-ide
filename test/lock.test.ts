import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createLockFile,
  removeLockFile,
  cleanStaleLockFiles,
} from "../src/lock.ts";

describe("lock", () => {
  let lockDir: string;

  beforeEach(() => {
    lockDir = mkdtempSync(join(tmpdir(), "lock-test-"));
  });

  afterEach(() => {
    rmSync(lockDir, { recursive: true, force: true });
  });

  it("createLockFile writes JSON with correct fields", () => {
    const path = createLockFile(
      { port: 9999, pid: 123, workspaceFolders: ["/vault"], authToken: "tok" },
      lockDir,
    );
    const data = JSON.parse(readFileSync(path, "utf-8"));
    assert.strictEqual(data.pid, 123);
    assert.strictEqual(data.ideName, "Obsidian");
    assert.strictEqual(data.transport, "ws");
    assert.strictEqual(data.authToken, "tok");
    assert.deepStrictEqual(data.workspaceFolders, ["/vault"]);
  });

  it("createLockFile names file by port", () => {
    const path = createLockFile(
      { port: 4242, pid: 1, workspaceFolders: [], authToken: "x" },
      lockDir,
    );
    assert.ok(path.endsWith("4242.lock"));
  });

  it("removeLockFile deletes the lock file", () => {
    createLockFile(
      { port: 5555, pid: 1, workspaceFolders: [], authToken: "x" },
      lockDir,
    );
    removeLockFile(5555, lockDir);
    const files = readdirSync(lockDir);
    assert.strictEqual(files.length, 0);
  });

  it("removeLockFile does not throw for missing file", () => {
    assert.doesNotThrow(() => removeLockFile(9999, lockDir));
  });

  it("cleanStaleLockFiles removes lock with dead pid", () => {
    writeFileSync(
      join(lockDir, "7777.lock"),
      JSON.stringify({ pid: 999999, ideName: "Obsidian" }),
    );
    cleanStaleLockFiles(lockDir);
    assert.strictEqual(readdirSync(lockDir).length, 0);
  });

  it("cleanStaleLockFiles skips non-Obsidian locks", () => {
    writeFileSync(
      join(lockDir, "8888.lock"),
      JSON.stringify({ pid: 999999, ideName: "VSCode" }),
    );
    cleanStaleLockFiles(lockDir);
    assert.strictEqual(readdirSync(lockDir).length, 1);
  });

  it("cleanStaleLockFiles keeps lock with alive foreign pid", () => {
    writeFileSync(
      join(lockDir, "6666.lock"),
      JSON.stringify({ pid: process.ppid, ideName: "Obsidian" }),
    );
    cleanStaleLockFiles(lockDir);
    assert.strictEqual(readdirSync(lockDir).length, 1);
  });

  it("cleanStaleLockFiles handles empty directory", () => {
    assert.doesNotThrow(() => cleanStaleLockFiles(lockDir));
  });

  it("cleanStaleLockFiles handles nonexistent directory", () => {
    assert.doesNotThrow(
      () => cleanStaleLockFiles("/tmp/nonexistent-lock-dir-xyz"),
    );
  });
});
