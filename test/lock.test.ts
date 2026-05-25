import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  statSync,
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

  it("createLockFile sets file permissions to 0o600", { skip: process.platform === "win32" }, () => {
    const path = createLockFile(
      { port: 9999, pid: 123, workspaceFolders: ["/vault"], authToken: "tok" },
      lockDir,
    );
    const mode = statSync(path).mode & 0o777;
    assert.strictEqual(mode, 0o600);
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

  it("cleanStaleLockFiles removes malformed JSON", () => {
    writeFileSync(join(lockDir, "4444.lock"), "{not-json");
    cleanStaleLockFiles(lockDir);
    assert.strictEqual(readdirSync(lockDir).length, 0);
  });

  it("cleanStaleLockFiles removes Obsidian lock without numeric pid", () => {
    writeFileSync(
      join(lockDir, "3333.lock"),
      JSON.stringify({
        pid: "not-a-number",
        ideName: "Obsidian",
        transport: "ws",
        authToken: "tok",
        workspaceFolders: ["/vault"],
      }),
    );
    cleanStaleLockFiles(lockDir);
    assert.strictEqual(readdirSync(lockDir).length, 0);
  });

  it("cleanStaleLockFiles removes Obsidian lock with zero pid", () => {
    writeFileSync(
      join(lockDir, "2222.lock"),
      JSON.stringify({
        pid: 0,
        ideName: "Obsidian",
        transport: "ws",
        authToken: "tok",
        workspaceFolders: ["/vault"],
      }),
    );
    cleanStaleLockFiles(lockDir);
    assert.strictEqual(readdirSync(lockDir).length, 0);
  });

  it("cleanStaleLockFiles removes Obsidian lock with negative pid", () => {
    writeFileSync(
      join(lockDir, "1111.lock"),
      JSON.stringify({
        pid: -1,
        ideName: "Obsidian",
        transport: "ws",
        authToken: "tok",
        workspaceFolders: ["/vault"],
      }),
    );
    cleanStaleLockFiles(lockDir);
    assert.strictEqual(readdirSync(lockDir).length, 0);
  });

  it("cleanStaleLockFiles skips non-Obsidian locks with unusable pid", () => {
    writeFileSync(
      join(lockDir, "8888.lock"),
      JSON.stringify({
        pid: "not-useful-to-obsidian",
        ideName: "VSCode",
        transport: "ws",
        workspaceFolders: ["/vault"],
      }),
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
