import { describe, expect, it } from "vitest";
import { parseEnvFile } from "../../src/core/envfile.js";
import { CredsError } from "../../src/core/errors.js";

describe("parseEnvFile", () => {
  it("parses literals, quoted values, comments, and creds references", () => {
    const entries = parseEnvFile(
      [
        "# comment",
        "PORT=3000",
        "PLAIN=value # comment",
        'QUOTED="value # not comment"',
        "DB_URL=creds:myapp/dev/db_url",
        "",
      ].join("\n"),
      ".env.test",
    );

    expect(entries).toEqual([
      { key: "PORT", rawValue: "3000" },
      { key: "PLAIN", rawValue: "value" },
      { key: "QUOTED", rawValue: "value # not comment" },
      { key: "DB_URL", rawValue: "creds:myapp/dev/db_url", credsEntry: "myapp/dev/db_url" },
    ]);
  });

  it("throws with file and line for malformed lines", () => {
    expect(() => parseEnvFile("PORT=3000\nBROKEN", ".env.test")).toThrow(CredsError);
    expect(() => parseEnvFile("PORT=3000\nBROKEN", ".env.test")).toThrow(
      ".env.test:2: invalid line",
    );
  });

  it("throws with file and line for invalid variable names", () => {
    expect(() => parseEnvFile("BAD-NAME=value", ".env.test")).toThrow(
      ".env.test:1: invalid variable name",
    );
  });

  it("validates creds entry paths", () => {
    expect(() => parseEnvFile("DB_URL=creds:myapp/dev", ".env.test")).toThrow(
      "minimum 3 segments",
    );
  });
});
