import { describe, it, expect, vi, afterEach } from "vitest";
import { writeStdout, writeStderr } from "../../src/core/stdio.js";

describe("writeStdout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("appends newline by default", () => {
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    writeStdout("hello", false);
    expect(spy).toHaveBeenCalledWith("hello\n");
  });

  it("omits newline when noNewline is true", () => {
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    writeStdout("hello", true);
    expect(spy).toHaveBeenCalledWith("hello");
  });
});

describe("writeStderr", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes to stderr with newline", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    writeStderr("error msg");
    expect(spy).toHaveBeenCalledWith("error msg\n");
  });
});
