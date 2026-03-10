# keychain-creds

Cross-platform credential manager CLI. Store and retrieve secrets securely via the native OS credential store.

- **macOS**: Keychain via `security`
- **Windows**: Credential Manager via Win32 API (PowerShell)
- **Linux**: Secret Service via `secret-tool`

Zero secret leakage: stdout/stderr contracts enforced. Contractual exit codes for reliable automation.

## Installation

```bash
npm install
npm run build
npm link  # makes `creds` available globally
```

Or install from a local path:

```bash
npm install -g .
```

After install, the `creds` command is available system-wide.

### Prerequisites per platform

| Platform | Requirement |
|----------|-------------|
| **macOS** | None (Keychain is built-in) |
| **Windows** | PowerShell 5.1+ (built-in on Windows 10+) |
| **Linux** | `secret-tool` — install `libsecret-tools` (Debian/Ubuntu) or `libsecret` (Arch) |

## Usage

### Store a secret

```bash
# Interactive (masked input, no echo)
creds set shared/openrouter_api_key

# Piped from stdin
echo -n "sk-xxx" | creds set shared/openrouter_api_key
```

**Never pass the secret as an argument** — `creds set entry value` will fail.

### Retrieve a secret

```bash
# stdout = value only (+ trailing newline)
creds get shared/openrouter_api_key

# Use in variable assignment
OPENROUTER_API_KEY="$(creds get shared/openrouter_api_key)" some-command
```

#### Options

| Flag | Description |
|------|-------------|
| `--no-newline` | Omit trailing newline |
| `--base64` | Base64-encode the output |
| `--json` | Output `{"entry":"...","value":"..."}` |
| `--export ENV_VAR` | Output `ENV_VAR=value` for `eval` |

```bash
# eval-friendly export
eval "$(creds get shared/openrouter_api_key --export OPENROUTER_API_KEY)"

# Base64 (safe for multi-line values)
creds get shared/cert/pem --base64
```

### Remove a secret

```bash
creds rm shared/openrouter_api_key
```

### Load environment and run a command

`creds env` reads a `.env` file, resolves all `creds:` references from the native credential store, and runs a command with the resolved environment variables injected.

```bash
# Launch a server with secrets resolved
creds env -- npm run dev

# Use a custom env file
creds env --file .env.local -- node server.js

# Preview which variables will be resolved (no values shown)
creds env --dry-run
```

#### `.env` file format

```bash
# Literal values are passed through as-is
PORT=3000
NODE_ENV=development

# creds: prefix → resolved from native credential store at launch
DATABASE_URL=creds:myapp/dev/db_url
OPENROUTER_API_KEY=creds:global/dev/openrouter_api_key
STRIPE_SECRET_KEY=creds:payments/prod/stripe_secret_key
```

- Lines starting with `#` and empty lines are ignored
- `KEY=value` → literal value, injected directly
- `KEY=creds:namespace/env/name` → resolved from the native credential store
- The actual secret is **never stored in the file**
- All `creds:` entries are resolved in parallel for speed

#### Options

| Flag | Description |
|------|-------------|
| `--file <path>` | Path to env file (default: `.env`) |
| `--dry-run` | Show variable names and sources, without values |

## Entry format

Entries use the format `namespace/env/name` (minimum 3 segments, lowercase).

```
myapp/dev/db_url
shared/openrouter_api_key
payments/prod/stripe_secret_key
```

Mapped to the credential store as: `service = "creds:<entry>"`, `account = $USER`.

Override account: `creds --account someone get myapp/dev/key`

## Global options

| Flag | Description |
|------|-------------|
| `--account <string>` | Override the account (default: `$USER`) |
| `--timeout-ms <ms>` | Timeout in milliseconds (default: 10000) |

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Usage / validation error |
| 2 | Entry not found |
| 3 | Credential store locked / access denied |
| 4 | Unexpected error |

## Platform details

### macOS

Uses the `security` CLI to interact with the system Keychain. Credentials are stored as generic passwords with `service = "creds:<entry>"`.

The `CREDS_SECURITY_BIN` environment variable can override the `security` binary path (useful for testing).

### Windows

Uses PowerShell with Win32 Credential Manager API (P/Invoke to `advapi32.dll`). Credentials are stored as `CRED_TYPE_GENERIC` entries.

**Note**: Generic credentials are limited to ~2,560 bytes on Windows.

### Linux

Uses `secret-tool` (libsecret) to interact with the Secret Service (GNOME Keyring, KDE Wallet, etc.). Credentials are identified by `service` and `account` attributes.

Requires a running D-Bus session. On headless servers without a desktop environment, Secret Service may not be available.

### Backend override

Set `CREDS_BACKEND` environment variable to force a specific backend: `macos`, `windows`, or `linux`.

## Security

- Secrets are **never** printed to stderr, logs, or decorative output
- `creds get` stdout contains **only** the secret value (or formatted variant)
- On error, stdout is always empty
- Uses `execFile` (not `exec`) to prevent shell injection
- On Windows, secrets are passed via stdin to PowerShell (never as CLI arguments)
- Avoid storing secrets in clipboard or shell history

## macOS Shortcuts

For use in macOS Shortcuts > Run Shell Script:

```bash
export PATH=/opt/homebrew/bin:$PATH && creds get shared/openrouter_api_key --no-newline
```

Shortcuts does not load the terminal `PATH`, so always prefix with the export.
