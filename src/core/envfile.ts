import { CredsError, EXIT } from "./errors.js";
import { validateEntry } from "./validation.js";

export interface EnvEntry {
  key: string;
  rawValue: string;
  credsEntry?: string;
}

const CREDS_PREFIX = "creds:";

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseEnvFile(content: string, filePath: string): EnvEntry[] {
  const entries: EnvEntry[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === "" || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      throw new CredsError(
        `${filePath}:${i + 1}: invalid line (expected KEY=value): ${line}`,
        EXIT.USAGE,
      );
    }

    const key = line.slice(0, eqIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new CredsError(
        `${filePath}:${i + 1}: invalid variable name: ${key}`,
        EXIT.USAGE,
      );
    }

    // Strip inline comment (only outside quotes)
    let rawPart = line.slice(eqIndex + 1).trim();
    const stripped = stripQuotes(rawPart);
    // If quotes were stripped, use the inner value as-is; otherwise strip inline comments
    let value: string;
    if (stripped !== rawPart) {
      value = stripped;
    } else {
      const commentIndex = rawPart.indexOf(" #");
      value = commentIndex !== -1 ? rawPart.slice(0, commentIndex).trim() : rawPart;
    }

    const entry: EnvEntry = { key, rawValue: value };

    if (value.startsWith(CREDS_PREFIX)) {
      const credsPath = value.slice(CREDS_PREFIX.length);
      validateEntry(credsPath);
      entry.credsEntry = credsPath;
    }

    entries.push(entry);
  }

  return entries;
}
