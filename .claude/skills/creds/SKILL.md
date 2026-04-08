---
name: creds
description: Load when writing or reviewing code/scripts that use the `creds` CLI (macOS Keychain secrets), or when asked about creds commands (set/get/env/rm), entry naming (namespace/env/name), exit codes, or secret injection patterns. Also load for macOS Shortcuts that call creds.
---

# creds CLI — Contract & Usage Guide

`creds` manages secrets via the native macOS Keychain. Zero plaintext, zero leaks.

## Commands

### `creds set <entry>`

Value via **piped stdin only**: `echo -n "sk-xxx" | creds set namespace/env/name` or masked TTY prompt.
stdout: empty. stderr: confirmation only, never the secret.

### `creds get <entry>`

stdout = **value only** (+ `\n` default). stderr = errors only.

| Option | Effect |
|--------|--------|
| `--no-newline` | omit trailing `\n` |
| `--base64` | base64-encode the value |
| `--json` | `{"entry":"...","value":"..."}` |
| `--export ENV_VAR` | `ENV_VAR=value` (for `eval`) |

On error: stdout **always empty**.

### `creds env [--file <path>] [--dry-run] -- <command...>`

Resolves `creds:entry` refs in a `.env` file and injects into child process environment.
- Secrets never transit stdout/stderr/file
- `--dry-run`: prints var names + source on stderr, **no values**
- Exit code = child process code (or creds error code)
- **Recommended method when multiple secrets are needed**

### `creds rm <entry>`

stdout: empty. stderr: `Removed namespace/env/name`.

## Global Options

- `--account <string>` : Keychain account override (default: `$USER`)
- `--timeout-ms <ms>` : timeout in ms (default: 10000)

## Entry Convention

Format: `namespace/env/name` — min 3 segments, lowercase, `[a-z0-9._-]` per segment.

- Valid: `myapp/dev/db_url`, `shared/prod/api_key`
- Invalid: `myapp`, `myapp/dev`, `MyApp/dev/key`, `myapp//dev/key`

Keychain mapping: `service = "creds:<entry>"`, `account = $USER`

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Usage / validation error |
| 2 | Entry not found |
| 3 | Keychain locked / access denied |
| 4 | Unexpected error |

On error: stdout **always empty**. Never parse stdout on code != 0.

## Recipes (do)

### Launch server or tests with secrets (preferred)

```bash
creds env -- bun run dev          # dev server
creds env -- bun test             # tests
creds env --file .env.test -- vitest run
creds env --dry-run               # inspect without secrets
```

`.env` format:
```bash
PORT=3000
DATABASE_URL=creds:myapp/dev/db_url
OPENROUTER_API_KEY=creds:global/dev/openrouter_api_key
```

### Single secret injection

```bash
OPENROUTER_API_KEY="$(creds get global/dev/openrouter_api_key)" some-command
eval "$(creds get global/dev/openrouter_api_key --export OPENROUTER_API_KEY)"
```

### Store from script

```bash
echo -n "$SECRET_VALUE" | creds set myapp/prod/api_key
```

### Check entry existence

```bash
creds get myapp/dev/db_url > /dev/null 2>&1 && echo "OK" || echo "missing" >&2
```

### Node.js / TypeScript

```typescript
import { execFileSync } from "node:child_process";
const secret = execFileSync("creds", ["get", "myapp/dev/api_key", "--no-newline"], { encoding: "utf-8" });
// Use `secret` — never log it.
```

## Anti-Patterns (don't)

| Pattern | Wrong | Correct |
|---------|-------|---------|
| `.env` plaintext | `OPENROUTER_API_KEY=sk-or-v1-XXX` | `OPENROUTER_API_KEY=creds:shared/openrouter_api_key` |
| Arg secret | `creds set myapp/dev/key sk-xxx` | pipe via stdin |
| Hardcoded curl | `curl -H "Bearer sk-xxx"` | `curl -H "Bearer $(creds get ... --no-newline)"` |
| Log value | `console.log("Key:", key)` | `console.log("Key retrieved")` |
| Profile export | `export KEY="sk-xxx"` in `.zshrc` | `export KEY="$(creds get ...)"` |

## macOS Shortcuts Notes

Shortcuts does not load `.zshrc` — `creds` not in PATH by default.

- Always prefix: `export PATH=/opt/homebrew/bin:$PATH && creds get ... --no-newline`
- `Run Shell Script` captures **stdout only** — `creds get` outputs value directly, compatible
- Use `--no-newline` to avoid stray `\n` downstream
- On error, stdout is empty → Shortcut receives `""`. Never display in notification/dialog.

## Notes & Edge Cases

- **3-segment minimum**: `shared/openrouter_api_key` has 3 segments (the `_` is intra-segment). No implicit segment mechanism.
- **`env` as segment**: `shared/cert/pem` is valid but `cert` reads as type, not environment. Prefer `namespace/env/name` strictly.
