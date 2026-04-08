# creds Skill Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la rule globale `keychain-creds.md` (8454 octets, chargée systématiquement) par un skill `creds` à déclenchement conditionnel, réduisant la consommation de contexte.

**Architecture:** Skill dans `keychain-creds/.claude/skills/creds/SKILL.md`, rule projet réduite aux gardes comportementales (~15 lignes), rule globale supprimée après validation du skill. Ordre critique : créer → optimiser → committer → lier → valider → supprimer.

**Tech Stack:** Markdown (SKILL.md format), cc-hub CLI, git, symlinks

---

### Task 1 : Créer le skill `creds`

**Files:**
- Create: `~/projects/keychain-creds/.claude/skills/creds/SKILL.md`

- [ ] **Step 1 : Créer le répertoire du skill**

```bash
mkdir -p ~/projects/keychain-creds/.claude/skills/creds
```

- [ ] **Step 2 : Créer SKILL.md avec frontmatter + contrat complet**

Créer `~/projects/keychain-creds/.claude/skills/creds/SKILL.md` avec le contenu suivant (frontmatter YAML + corps complet) :

```markdown
---
name: creds
description: |
  Load when writing code or shell scripts that use the `creds` CLI,
  when injecting secrets from the macOS Keychain, when asked about
  `creds set`, `creds get`, `creds env`, or `creds rm` commands,
  entry naming conventions (namespace/env/name), exit codes, or
  secret injection patterns. Also load when reviewing or debugging
  code that uses the creds binary, or when writing macOS Shortcuts
  that call creds.
---

# creds CLI — Contract & Usage Guide

`creds` is a CLI for managing secrets via the native macOS Keychain. Zero secrets in plaintext, zero leaks.

## Commands

### `creds set <entry>`

Stores a secret in the Keychain. Value provided **only** via:
- Piped stdin: `echo -n "sk-xxx" | creds set namespace/env/name`
- Masked interactive prompt (if TTY)

stdout: empty. stderr: confirmation only (e.g. `Stored namespace/env/name`), never the secret.

### `creds get <entry>`

Retrieves a secret from the Keychain.

stdout = **value only** (+ `\n` by default). No decorative text.
stderr = errors only. Empty on success.

Options:
- `--no-newline` : omit trailing `\n`
- `--base64` : base64-encode the value
- `--json` : `{"entry":"...","value":"..."}` on stdout
- `--export ENV_VAR` : `ENV_VAR=value` on stdout (for `eval`)

On error: stdout is **always empty**.

### `creds env [--file <path>] [--dry-run] -- <command...>`

Reads a `.env` file (or `--file`), resolves `creds:entry` references from the Keychain, and launches `<command>` with the injected environment.

- Secrets never transit through stdout/stderr/file — injected only into child process environment
- `--dry-run` : prints variable names and their source (literal or creds:entry) on stderr, **without any values**
- Exit code = child process exit code (or creds error code on resolution failure)
- **This is the recommended method for launching servers or tests requiring secrets**

### `creds rm <entry>`

Removes an entry from the Keychain.

stdout: empty. stderr: confirmation (e.g. `Removed namespace/env/name`).

## Global Options

- `--account <string>` : Keychain account override (default: `$USER`)
- `--timeout-ms <ms>` : timeout in milliseconds (default: 10000)

## Entry Convention

Format: `namespace/env/name` — minimum 3 segments, lowercase.

- Allowed characters per segment: `[a-z0-9._-]`
- No spaces, no `//`, no trailing `/`, no uppercase.
- Valid: `myapp/dev/db_url`, `shared/prod/api_key`, `payments/prod/stripe_secret_key`
- Invalid: `myapp`, `myapp/dev`, `MyApp/dev/key`, `myapp//dev/key`

## Keychain Mapping

- `service = "creds:<entry>"` (e.g. `creds:myapp/dev/db_url`)
- `account = $USER` (or `--account` value)

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Usage / validation / argument error |
| 2 | Entry not found |
| 3 | Keychain locked / access denied |
| 4 | Unexpected error |

On error: stdout is **always empty**. Never parse stdout on code != 0.

## Recipes (do)

### Launch server or tests with secrets (recommended method)

Use `creds env` to automatically inject all secrets from a `.env` file:

```bash
# Dev server
creds env -- bun run dev

# Tests
creds env -- bun test

# Custom env file
creds env --file .env.test -- vitest run

# Verify variables before launch
creds env --dry-run
```

`.env` file format with `creds:` prefix for secrets:

```bash
PORT=3000
DATABASE_URL=creds:myapp/dev/db_url
OPENROUTER_API_KEY=creds:global/dev/openrouter_api_key
```

**Always prefer `creds env`** when multiple secrets are needed.

### Inject a single secret into a command

```bash
OPENROUTER_API_KEY="$(creds get global/dev/openrouter_api_key)" some-command
```

### Export to current shell via eval

```bash
eval "$(creds get global/dev/openrouter_api_key --export OPENROUTER_API_KEY)"
```

### Store a secret from a script

```bash
echo -n "$SECRET_VALUE" | creds set myapp/prod/api_key
```

### Use in a macOS Shortcut (Run Shell Script action)

Shortcuts does not load the terminal `PATH`. Always prefix with PATH export:

```bash
export PATH=/opt/homebrew/bin:$PATH && creds get global/dev/omdb_api --no-newline
```

### Check if an entry exists before using it

```bash
if creds get myapp/dev/db_url > /dev/null 2>&1; then
  echo "OK"
else
  echo "Entry missing" >&2
fi
```

### In Node.js / TypeScript code

```typescript
import { execFileSync } from "node:child_process";

const secret = execFileSync("creds", ["get", "myapp/dev/api_key", "--no-newline"], {
  encoding: "utf-8",
});
// Use `secret` — never log it.
```

## Anti-Patterns (don't)

### `.env` file with plaintext secret

```bash
# FORBIDDEN
OPENROUTER_API_KEY=sk-or-v1-XXXXXXX

# CORRECT — creds reference, no plaintext secret
OPENROUTER_API_KEY=creds:shared/openrouter_api_key
DATABASE_URL=creds:myapp/dev/db_url
```

### Secret as command argument

```bash
# FORBIDDEN — will fail AND expose the secret in shell history
creds set myapp/dev/key sk-or-v1-XXXXXXX
```

### Hardcoded secret in curl or script

```bash
# FORBIDDEN
curl -H "Authorization: Bearer sk-or-v1-XXXXXXX" https://api.example.com

# CORRECT
curl -H "Authorization: Bearer $(creds get global/dev/api_key --no-newline)" https://api.example.com
```

### Logging the value

```typescript
// FORBIDDEN
const key = execFileSync("creds", ["get", "myapp/dev/key", "--no-newline"], { encoding: "utf-8" });
console.log("Key retrieved:", key);  // LEAK

// CORRECT
console.log("Key retrieved successfully");  // Not the value
```

### Hardcoded export in shell profile

```bash
# FORBIDDEN in .bashrc / .zshrc
export OPENROUTER_API_KEY="sk-or-v1-XXXXXXX"

# CORRECT — dynamic resolution
export OPENROUTER_API_KEY="$(creds get global/dev/openrouter_api_key)"
```

## macOS Shortcuts Notes

- Shortcuts does not load `.zshrc`: `creds` and `node` are not in `PATH` by default
- Always start with `export PATH=/opt/homebrew/bin:$PATH && ...`
- "Run Shell Script" action captures **stdout only**
- `creds get` writes only the value on stdout — compatible directly
- Use `--no-newline` to avoid a stray `\n` downstream
- On error, stdout is empty: the Shortcut receives an empty string
- Never display the result of `creds get` in a Shortcuts notification or dialog

## Notes & Edge Cases

- **Entry `shared/openrouter_api_key`**: used in examples with the comment "3 segments with implied default", but this is indeed 3 segments (`shared` / `openrouter` / `api_key` separated by `/`). The `_` is an intra-segment character, not a separator. The example is valid but the "implied default" comment is ambiguous — there is no implicit segment mechanism in the implementation.
- **Entry `shared/cert/pem`**: valid (3 segments), but `cert` looks more like a type than an environment. The convention would benefit from stricter documentation if `env` is truly required as the second segment.
```

- [ ] **Step 3 : Relire le fichier créé**

```bash
head -20 ~/projects/keychain-creds/.claude/skills/creds/SKILL.md
wc -l ~/projects/keychain-creds/.claude/skills/creds/SKILL.md
```

Expected: frontmatter YAML présent en tête, ~170+ lignes au total.

---

### Task 2 : Réduire la rule projet aux gardes comportementales

**Files:**
- Modify: `~/projects/keychain-creds/.claude/rules/keychain-creds.md`

- [ ] **Step 1 : Lire le fichier actuel**

```bash
wc -l ~/projects/keychain-creds/.claude/rules/keychain-creds.md
```

Expected: ~250 lignes (la rule complète actuelle).

- [ ] **Step 2 : Remplacer le contenu par la version minimaliste**

Écrire `~/projects/keychain-creds/.claude/rules/keychain-creds.md` avec uniquement :

```markdown
# creds — Behavioral Guards

These guards apply whenever `creds` is used in this project. They are non-negotiable and complement the `/creds` skill.

## Absolute Prohibitions

- **Never** use `child_process.exec()` to call `security` or `creds`. Always use `execFile()`.
- **Never** build a shell command by string concatenation. Use argument arrays.
- **Never** log the value returned by `creds get`. Not even partially, not even truncated.
- **Never** pass a secret as a CLI argument: `creds set entry value` is forbidden and will fail.
- **Never** write a secret in plaintext in any file (.env, script, test, config, YAML, JSON).
```

- [ ] **Step 3 : Relire le fichier modifié**

```bash
cat ~/projects/keychain-creds/.claude/rules/keychain-creds.md
```

Expected: ~15 lignes, uniquement les 5 prohibitions, aucun contenu du contrat.

---

### Task 3 : Optimiser le skill via meta-skill-creator

**Files:**
- Modify (éventuellement): `~/projects/keychain-creds/.claude/skills/creds/SKILL.md`

- [ ] **Step 1 : Invoquer meta-skill-creator**

Lire le SKILL.md actuel, puis invoquer le skill `/meta-skill-creator` via le Skill tool en lui passant le contenu du SKILL.md pour optimisation du frontmatter et de la structure.

- [ ] **Step 2 : Relire intégralement le SKILL.md résultant**

```bash
cat ~/projects/keychain-creds/.claude/skills/creds/SKILL.md
```

Vérifier que :
- Le frontmatter est valide (champs `name` et `description` présents)
- Le contrat complet est intact (commandes, recettes, anti-patterns)
- Aucun contenu critique n'a été perdu

- [ ] **Step 3 : Appliquer les modifications validées**

Si meta-skill-creator propose des améliorations, les appliquer dans `~/projects/keychain-creds/.claude/skills/creds/SKILL.md`.

---

### Task 4 : Committer les changements

**Files:** `.claude/skills/creds/SKILL.md` (nouveau) + `.claude/rules/keychain-creds.md` (modifié)

- [ ] **Step 1 : Vérifier l'état git**

```bash
cd ~/projects/keychain-creds && git status
```

Expected: 
- New file: `.claude/skills/creds/SKILL.md`
- Modified: `.claude/rules/keychain-creds.md`
- New files: `docs/superpowers/specs/...` et `docs/superpowers/plans/...`

Note: `~/.claude/rules/keychain-creds.md` est hors repo — ne pas le stager.

- [ ] **Step 2 : Invoquer /git.commit**

Utiliser le skill `/git.commit` — NE PAS utiliser `git commit` directement (bloqué par commit-guard hook).

Message de commit suggéré : `feat: migrate keychain-creds rule to on-demand creds skill`

---

### Task 5 : Lier le skill globalement

**Files:** Symlink `~/.claude/skills/creds`

- [ ] **Step 1 : Lier via cc-hub**

```bash
cc-hub skill link ~/projects/keychain-creds/.claude/skills/creds
```

Expected (stderr): confirmation du lien créé.

- [ ] **Step 2 : Vérifier le symlink**

```bash
ls -la ~/.claude/skills/ | grep creds
```

Expected: `creds -> /Users/julienm/projects/keychain-creds/.claude/skills/creds`

- [ ] **Step 3 : Vérifier que SKILL.md est accessible via le lien**

```bash
cat ~/.claude/skills/creds/SKILL.md | head -10
```

Expected: frontmatter du skill visible.

---

### Task 6 : Supprimer la rule globale

**Files:** `~/.claude/rules/keychain-creds.md` (hors repo)

- [ ] **Step 1 : Sauvegarder la rule globale**

```bash
cp ~/.claude/rules/keychain-creds.md /tmp/keychain-creds.rule.backup
```

- [ ] **Step 2 : Confirmer que c'est un fichier direct (pas un symlink)**

```bash
ls -la ~/.claude/rules/keychain-creds.md
```

Expected: `-rw-r--r--` sans `->` (fichier direct). Si c'est un symlink, arrêter et investiguer.

- [ ] **Step 3 : Supprimer la rule globale**

```bash
rm ~/.claude/rules/keychain-creds.md
```

- [ ] **Step 4 : Vérifier la suppression**

```bash
ls ~/.claude/rules/ | grep keychain
```

Expected: aucune sortie (fichier supprimé).
