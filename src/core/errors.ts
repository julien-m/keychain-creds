export const EXIT = {
  SUCCESS: 0,
  USAGE: 1,
  NOT_FOUND: 2,
  KEYCHAIN_DENIED: 3,
  UNEXPECTED: 4,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export class CredsError extends Error {
  constructor(
    message: string,
    public readonly exitCode: ExitCode,
  ) {
    super(message);
    this.name = "CredsError";
  }
}

export function mapSecurityError(stderr: string): CredsError {
  const lower = stderr.toLowerCase();

  if (lower.includes("could not be found")) {
    return new CredsError("Entry not found in Keychain", EXIT.NOT_FOUND);
  }

  if (
    lower.includes("user interaction is not allowed") ||
    lower.includes("interaction not allowed") ||
    lower.includes("keychain is locked")
  ) {
    return new CredsError(
      "Keychain access denied (locked or not allowed)",
      EXIT.KEYCHAIN_DENIED,
    );
  }

  return new CredsError(
    `Keychain error: ${stderr.trim()}`,
    EXIT.UNEXPECTED,
  );
}
