import { z } from "zod";

import { CredsError, EXIT } from "./errors.js";

const ENTRY_RE = /^[a-z0-9._-]+\/[a-z0-9._-]+\/[a-z0-9._-]+(\/[a-z0-9._-]+)*$/;

export const entrySchema = z
  .string()
  .min(1, "Entry cannot be empty")
  .regex(ENTRY_RE, "Entry must match namespace/env/name (lowercase, no spaces, no trailing slash, minimum 3 segments)");

export function validateEntry(entry: string): string {
  const result = entrySchema.safeParse(entry);
  if (!result.success) {
    throw new CredsError(result.error.issues[0].message, EXIT.USAGE);
  }
  return result.data;
}

export function toService(entry: string): string {
  return `creds:${entry}`;
}

export function defaultAccount(): string {
  return process.env.USER || process.env.LOGNAME || "unknown";
}
