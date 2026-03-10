import { describe, it, expect } from "vitest";
import { execFile, spawn } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve(__dirname, "../../dist/cli.js");
const MOCK = resolve(__dirname, "../fixtures/security-mock.js");

function runCli(
  args: string[],
  opts: { stdin?: string; env?: Record<string, string> } = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn("node", [CLI, ...args], {
      env: {
        ...process.env,
        CREDS_SECURITY_BIN: MOCK,
          CREDS_SECRET_TOOL_BIN: MOCK,
          CREDS_PS_BIN: MOCK,
        ...opts.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    if (opts.stdin !== undefined) {
      child.stdin.write(opts.stdin);
      child.stdin.end();
    }

    child.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}

describe("creds set (CLI)", () => {
  it("accepts secret from stdin pipe", async () => {
    const { stdout, code } = await runCli(
      ["set", "myapp/dev/db_url"],
      { stdin: "my-piped-secret" },
    );
    expect(stdout).toBe("");
    expect(code).toBe(0);
  });

  it("stderr never contains the secret", async () => {
    const secret = "SUPER_SECRET_NEVER_LEAK";
    const { stderr } = await runCli(
      ["set", "myapp/dev/db_url"],
      { stdin: secret },
    );
    expect(stderr).not.toContain(secret);
  });

  it("stdout is always empty", async () => {
    const { stdout } = await runCli(
      ["set", "myapp/dev/db_url"],
      { stdin: "some-secret" },
    );
    expect(stdout).toBe("");
  });

  it("rejects invalid entry names", async () => {
    const { code } = await runCli(
      ["set", "invalid"],
      { stdin: "secret" },
    );
    expect(code).toBe(1);
  });

  it("rejects empty secret from stdin", async () => {
    const { code } = await runCli(
      ["set", "myapp/dev/db_url"],
      { stdin: "" },
    );
    expect(code).toBe(1);
  });
});
