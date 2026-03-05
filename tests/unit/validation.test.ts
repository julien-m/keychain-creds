import { describe, it, expect } from "vitest";
import { validateEntry, toService, defaultAccount } from "../../src/core/validation.js";

describe("validateEntry", () => {
  it("accepts valid 3-segment entries", () => {
    expect(validateEntry("myapp/dev/db_url")).toBe("myapp/dev/db_url");
    expect(validateEntry("shared/prod/api-key")).toBe("shared/prod/api-key");
    expect(validateEntry("a/b/c")).toBe("a/b/c");
  });

  it("accepts entries with more than 3 segments", () => {
    expect(validateEntry("a/b/c/d")).toBe("a/b/c/d");
    expect(validateEntry("org/team/env/name")).toBe("org/team/env/name");
  });

  it("accepts entries with dots and hyphens", () => {
    expect(validateEntry("my.app/dev/db-url")).toBe("my.app/dev/db-url");
    expect(validateEntry("my-app/staging/secret.key")).toBe("my-app/staging/secret.key");
  });

  it("rejects empty strings", () => {
    expect(() => validateEntry("")).toThrow();
  });

  it("rejects entries with fewer than 3 segments", () => {
    expect(() => validateEntry("myapp")).toThrow();
    expect(() => validateEntry("myapp/dev")).toThrow();
  });

  it("rejects entries with spaces", () => {
    expect(() => validateEntry("my app/dev/key")).toThrow();
  });

  it("rejects entries with double slashes", () => {
    expect(() => validateEntry("myapp//dev/key")).toThrow();
  });

  it("rejects entries with trailing slash", () => {
    expect(() => validateEntry("myapp/dev/key/")).toThrow();
  });

  it("rejects entries with uppercase", () => {
    expect(() => validateEntry("MyApp/dev/key")).toThrow();
  });

  it("rejects entries with leading slash", () => {
    expect(() => validateEntry("/myapp/dev/key")).toThrow();
  });
});

describe("toService", () => {
  it("prefixes with creds:", () => {
    expect(toService("myapp/dev/db_url")).toBe("creds:myapp/dev/db_url");
  });
});

describe("defaultAccount", () => {
  it("returns USER env var", () => {
    const result = defaultAccount();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
