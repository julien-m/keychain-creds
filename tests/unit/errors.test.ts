import { describe, it, expect } from "vitest";
import { mapSecurityError, EXIT } from "../../src/core/errors.js";

describe("mapSecurityError", () => {
  it("maps 'could not be found' to NOT_FOUND (2)", () => {
    const err = mapSecurityError("security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.");
    expect(err.exitCode).toBe(EXIT.NOT_FOUND);
  });

  it("maps 'User interaction is not allowed' to KEYCHAIN_DENIED (3)", () => {
    const err = mapSecurityError("security: User interaction is not allowed.");
    expect(err.exitCode).toBe(EXIT.KEYCHAIN_DENIED);
  });

  it("maps 'interaction not allowed' to KEYCHAIN_DENIED (3)", () => {
    const err = mapSecurityError("interaction not allowed");
    expect(err.exitCode).toBe(EXIT.KEYCHAIN_DENIED);
  });

  it("maps 'keychain is locked' to KEYCHAIN_DENIED (3)", () => {
    const err = mapSecurityError("The keychain is locked.");
    expect(err.exitCode).toBe(EXIT.KEYCHAIN_DENIED);
  });

  it("maps unknown errors to UNEXPECTED (4)", () => {
    const err = mapSecurityError("something else went wrong");
    expect(err.exitCode).toBe(EXIT.UNEXPECTED);
  });
});
