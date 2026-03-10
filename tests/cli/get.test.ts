import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve(__dirname, "../../dist/cli.js");
const MOCK = resolve(__dirname, "../fixtures/security-mock.js");

function run(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(
      "node",
      [CLI, ...args],
      {
        env: {
          ...process.env,
          CREDS_SECURITY_BIN: MOCK,
          CREDS_SECRET_TOOL_BIN: MOCK,
          CREDS_PS_BIN: MOCK,
          ...env,
        },
        timeout: 10_000,
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: error?.code !== undefined ? (typeof error.code === "number" ? error.code : 1) : (error as NodeJS.ErrnoException | null)?.status ?? 0,
        });
      },
    );
  });
}

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
          CREDS_SECRET_TOOL_BIN: MOCK,
          CREDS_PS_BIN: MOCK,
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

describe("creds get (CLI)", () => {
  it("outputs exactly the secret value with trailing newline", async () => {
    const { stdout, stderr, code } = await runCli(
      ["get", "myapp/dev/db_url"],
      { MOCK_SECRET: "my-secret-value" },
    );
    expect(stdout).toBe("my-secret-value\n");
    expect(stderr).toBe("");
    expect(code).toBe(0);
  });

  it("--no-newline omits trailing newline", async () => {
    const { stdout, code } = await runCli(
      ["get", "myapp/dev/db_url", "--no-newline"],
      { MOCK_SECRET: "my-secret-value" },
    );
    expect(stdout).toBe("my-secret-value");
    expect(code).toBe(0);
  });

  it("--json outputs valid JSON with entry and value", async () => {
    const { stdout, code } = await runCli(
      ["get", "myapp/dev/db_url", "--json"],
      { MOCK_SECRET: "my-secret-value" },
    );
    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toEqual({
      entry: "myapp/dev/db_url",
      value: "my-secret-value",
    });
    expect(code).toBe(0);
  });

  it("--export outputs ENV=value format", async () => {
    const { stdout, code } = await runCli(
      ["get", "myapp/dev/db_url", "--export", "DB_URL"],
      { MOCK_SECRET: "my-secret-value" },
    );
    expect(stdout.trim()).toBe("DB_URL=my-secret-value");
    expect(code).toBe(0);
  });

  it("--base64 encodes the value", async () => {
    const { stdout, code } = await runCli(
      ["get", "myapp/dev/db_url", "--base64"],
      { MOCK_SECRET: "hello" },
    );
    expect(stdout.trim()).toBe(Buffer.from("hello").toString("base64"));
    expect(code).toBe(0);
  });

  it("exits 2 for not found", async () => {
    const { stdout, code } = await runCli(
      ["get", "myapp/dev/missing"],
      { MOCK_ERROR: "NOT_FOUND" },
    );
    expect(stdout).toBe("");
    expect(code).toBe(2);
  });

  it("exits 3 for interaction not allowed", async () => {
    const { stdout, code } = await runCli(
      ["get", "myapp/dev/locked"],
      { MOCK_ERROR: "ACCESS_DENIED" },
    );
    expect(stdout).toBe("");
    expect(code).toBe(3);
  });

  it("exits 1 for invalid entry", async () => {
    const { stdout, code } = await runCli(["get", "invalid"]);
    expect(stdout).toBe("");
    expect(code).toBe(1);
  });
});

describe("creds get (Shortcuts compatibility)", () => {
  it("stdout contains ONLY the secret value, no decorative text", async () => {
    const secret = "sk-abc123xyz";
    const { stdout } = await runCli(
      ["get", "shared/prod/api_key"],
      { MOCK_SECRET: secret },
    );
    // stdout must be exactly the secret + newline
    expect(stdout).toBe(secret + "\n");
    // No labels, no prefixes
    expect(stdout).not.toMatch(/^[A-Z]/);
    expect(stdout).not.toContain(":");
    expect(stdout).not.toContain("=");
  });

  it("stdout has no spaces or labels, just the raw value", async () => {
    const secret = "test-value-42";
    const { stdout } = await runCli(
      ["get", "app/env/key"],
      { MOCK_SECRET: secret },
    );
    const lines = stdout.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(secret);
  });
});

describe("creds get (hex decode)", () => {
  it.skipIf(process.platform !== "darwin")("decodes hex-encoded response from macOS security", async () => {
    // macOS sometimes returns passwords as hex — simulate that
    const original = "sk-or-v1-abc123";
    const hex = Buffer.from(original, "utf-8").toString("hex");
    const { stdout, code } = await runCli(
      ["get", "myapp/dev/api_key"],
      { MOCK_SECRET: hex },
    );
    expect(stdout.trim()).toBe(original);
    expect(code).toBe(0);
  });

  it("does not decode values that are not hex", async () => {
    const { stdout } = await runCli(
      ["get", "myapp/dev/db_url"],
      { MOCK_SECRET: "just-a-normal-password" },
    );
    expect(stdout.trim()).toBe("just-a-normal-password");
  });

  it("does not decode odd-length hex-like strings", async () => {
    const { stdout } = await runCli(
      ["get", "myapp/dev/db_url"],
      { MOCK_SECRET: "abc" },
    );
    expect(stdout.trim()).toBe("abc");
  });
});

describe("creds get (anti-leak)", () => {
  it("never leaks the secret to stderr on success", async () => {
    const secret = "SUPER_SECRET_VALUE_12345";
    const { stderr } = await runCli(
      ["get", "myapp/dev/db_url"],
      { MOCK_SECRET: secret },
    );
    expect(stderr).not.toContain(secret);
  });

  it("never leaks the secret to stderr on error", async () => {
    const secret = "SUPER_SECRET_VALUE_12345";
    const { stderr } = await runCli(
      ["get", "myapp/dev/db_url"],
      {
        MOCK_SECRET: secret,
        MOCK_EXIT_CODE: "1",
        MOCK_STDERR: "something went wrong",
      },
    );
    expect(stderr).not.toContain(secret);
  });

  it("stdout is empty on error", async () => {
    const { stdout } = await runCli(
      ["get", "myapp/dev/db_url"],
      {
        MOCK_EXIT_CODE: "1",
        MOCK_STDERR: "security: The specified item could not be found in the keychain.\n",
      },
    );
    expect(stdout).toBe("");
  });
});
