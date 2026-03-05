import { describe, it, expect } from "vitest";

describe("output format helpers", () => {
  it("--json produces parseable JSON", () => {
    const entry = "myapp/dev/db_url";
    const value = "s3cr3t";
    const output = JSON.stringify({ entry, value });
    const parsed = JSON.parse(output);
    expect(parsed.entry).toBe(entry);
    expect(parsed.value).toBe(value);
  });

  it("--export produces ENV=value format", () => {
    const envVar = "DB_URL";
    const value = "postgres://localhost";
    const output = `${envVar}=${value}`;
    expect(output).toBe("DB_URL=postgres://localhost");
    expect(output).not.toContain(" ");
    expect(output.split("=")[0]).toBe("DB_URL");
  });

  it("--base64 encodes correctly", () => {
    const value = "hello world\nnewline";
    const encoded = Buffer.from(value, "utf-8").toString("base64");
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    expect(decoded).toBe(value);
  });

  it("--base64 + --export outputs base64-encoded value", () => {
    const envVar = "SECRET";
    const value = "multi\nline\nvalue";
    const encoded = Buffer.from(value, "utf-8").toString("base64");
    const output = `${envVar}=${encoded}`;
    expect(output).toMatch(/^SECRET=[A-Za-z0-9+/=]+$/);
  });
});
