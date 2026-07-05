import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCLI } from "./helpers.js";

const tempDirs: string[] = [];

function tempEnvFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "creds-env-test-"));
  tempDirs.push(dir);
  const filePath = join(dir, ".env.test");
  writeFileSync(filePath, content);
  return filePath;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("creds env (CLI)", () => {
  it("dry-run prints variable names and sources without values", async () => {
    const filePath = tempEnvFile("PORT=3000\nDB_URL=creds:myapp/dev/db_url\n");

    const result = await runCLI(["env", "--file", filePath, "--dry-run"], {
      env: { MOCK_SECRET: "postgres://secret" },
    });

    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("PORT (literal)");
    expect(result.stderr).toContain("DB_URL (creds:myapp/dev/db_url)");
    expect(result.stderr).not.toContain("postgres://secret");
    expect(result.exitCode).toBe(0);
  });

  it("resolves creds references and injects them into the child process", async () => {
    const filePath = tempEnvFile("PORT=3000\nDB_URL=creds:myapp/dev/db_url\n");

    const result = await runCLI(
      ["env", "--file", filePath, "--", process.execPath, "-e", "process.stdout.write(`${process.env.PORT}:${process.env.DB_URL}`)"],
      { env: { MOCK_SECRET: "postgres://secret" } },
    );

    expect(result.stdout).toBe("3000:postgres://secret");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("propagates the child process exit code", async () => {
    const filePath = tempEnvFile("PORT=3000\n");

    const result = await runCLI(["env", "--file", filePath, "--", process.execPath, "-e", "process.exit(7)"]);

    expect(result.exitCode).toBe(7);
  });

  it("fails when the env file is missing", async () => {
    const result = await runCLI(["env", "--file", join(tmpdir(), "missing-creds-env-file"), "--dry-run"]);

    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("File not found");
    expect(result.exitCode).toBe(1);
  });

  it("returns not-found when a referenced credential is missing", async () => {
    const filePath = tempEnvFile("DB_URL=creds:myapp/dev/db_url\n");

    const result = await runCLI(
      ["env", "--file", filePath, "--", process.execPath, "-e", "process.stdout.write('should not run')"],
      { env: { MOCK_ERROR: "NOT_FOUND" } },
    );

    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Entry not found");
    expect(result.exitCode).toBe(2);
  });
});
