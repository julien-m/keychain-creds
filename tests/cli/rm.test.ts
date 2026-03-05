import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve(__dirname, "../../dist/cli.js");
const MOCK = resolve(__dirname, "../fixtures/security-mock.js");

function runCli(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = execFile(
      "node",
      [CLI, ...args],
      {
        env: {
          ...process.env,
          CREDS_SECURITY_BIN: MOCK,
          ...env,
        },
        timeout: 10_000,
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}

describe("creds rm (CLI)", () => {
  it("removes successfully with exit 0", async () => {
    const { stdout, code } = await runCli(["rm", "myapp/dev/db_url"]);
    expect(stdout).toBe("");
    expect(code).toBe(0);
  });

  it("exits 2 when entry not found", async () => {
    const { stdout, code } = await runCli(
      ["rm", "myapp/dev/missing"],
      {
        MOCK_EXIT_CODE: "1",
        MOCK_STDERR: "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.\n",
      },
    );
    expect(stdout).toBe("");
    expect(code).toBe(2);
  });

  it("rejects invalid entry names", async () => {
    const { code } = await runCli(["rm", "bad"]);
    expect(code).toBe(1);
  });

  it("stdout is always empty", async () => {
    const { stdout } = await runCli(["rm", "myapp/dev/db_url"]);
    expect(stdout).toBe("");
  });
});
