# keychain-creds

macOS Keychain credential manager CLI. Store and retrieve secrets securely via the system Keychain.

- Human-friendly terminal usage + machine-friendly for scripts and macOS Shortcuts
- Zero secret leakage: stdout/stderr contracts enforced
- Contractual exit codes for reliable automation

## Installation

```bash
npm install
npm run build
npm link  # makes `creds` available globally
```

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

# Use in macOS Shortcuts > Run Shell Script
export PATH=/opt/homebrew/bin:$PATH && creds get shared/openrouter_api_key --no-newline
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

## Entry format

Entries use the format `namespace/env/name` (minimum 3 segments, lowercase).

```
myapp/dev/db_url
shared/openrouter_api_key       # → shared/openrouter_api_key (3 segments with implied default)
payments/prod/stripe_secret_key
```

Mapped to Keychain as: `service = "creds:<entry>"`, `account = $USER`.

Override account: `creds --account someone get myapp/dev/key`

### Load environment and run a command

`creds env` reads a `.env` file, resolves all `creds:` references from the Keychain, and runs a command with the resolved environment variables injected.

```bash
# Launch a server with secrets resolved from Keychain
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

# creds: prefix → resolved from Keychain at launch
DATABASE_URL=creds:myapp/dev/db_url
OPENROUTER_API_KEY=creds:global/dev/openrouter_api_key
STRIPE_SECRET_KEY=creds:payments/prod/stripe_secret_key
```

- Lines starting with `#` and empty lines are ignored
- `KEY=value` → literal value, injected directly
- `KEY=creds:namespace/env/name` → resolved from Keychain via `creds get`
- The actual secret is **never stored in the file**
- All `creds:` entries are resolved in parallel for speed

#### Options

| Flag | Description |
|------|-------------|
| `--file <path>` | Path to env file (default: `.env`) |
| `--dry-run` | Show variable names and sources, without values |

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Usage / validation error |
| 2 | Entry not found |
| 3 | Keychain locked / access denied |
| 4 | Unexpected error |

## Security

- Secrets are **never** printed to stderr, logs, or decorative output
- `creds get` stdout contains **only** the secret value (or formatted variant)
- On error, stdout is always empty
- Uses `execFile` (not `exec`) to prevent shell injection
- Avoid storing secrets in clipboard or shell history
