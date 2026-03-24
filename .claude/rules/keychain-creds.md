# Règles Claude Code — keychain-creds

## 1) Portée & objectif

Ce fichier régit le comportement de Claude Code dans le contexte du projet `keychain-creds` (CLI: `creds`).
Il s'applique dès qu'un secret est manipulé, qu'un script/exemple est produit, ou qu'une commande `creds` est suggérée.

Objectif : **zéro fuite de secret**, en toute circonstance.

---

## 2) Règles absolues (interdictions)

### Secrets — ne JAMAIS :

- Inventer un secret (même pour un exemple). Utiliser `sk-xxx`, `***`, ou `<votre-clé>`.
- Demander à l'utilisateur de coller un secret dans la conversation.
- Écrire un secret dans un fichier : `.env`, script, test, doc, config, YAML, JSON, etc.
- Afficher un secret dans stdout, stderr, ou logs — même partiellement, même tronqué.
- Proposer de passer un secret en argument CLI (`creds set entry value` est interdit et échouera).
- Recommander le clipboard pour manipuler des secrets.
- Inclure un vrai secret dans un snapshot de test, un mock, ou un fixture.
- Logger la valeur retournée par `creds get` (jamais de `console.log(secret)`).

### Code — ne JAMAIS :

- Utiliser `child_process.exec()` pour appeler `security`. Toujours `execFile`.
- Construire une commande shell par concaténation de chaînes.
- Écrire `export OPENROUTER_API_KEY=sk-...` en dur dans un script ou un `.bashrc`.

---

## 3) Contrat d'utilisation de `creds`

### Commandes disponibles

#### `creds set <entry>`
- La valeur du secret est fournie **uniquement** via :
  - stdin pipé : `echo -n "sk-xxx" | creds set namespace/env/name`
  - prompt interactif masqué (si TTY)
- stdout : vide.
- stderr : confirmation uniquement (ex: `Stored namespace/env/name`), jamais le secret.

#### `creds get <entry>`
- stdout = **valeur uniquement** (+ `\n` par défaut). Aucun texte décoratif.
- stderr = erreurs uniquement. Vide en cas de succès.
- Options :
  - `--no-newline` : omet le `\n` final.
  - `--base64` : encode la valeur en base64.
  - `--json` : `{"entry":"...","value":"..."}` sur stdout.
  - `--export ENV_VAR` : `ENV_VAR=valeur` sur stdout (pour `eval`).
- En cas d'erreur : stdout **vide**, toujours.

#### `creds env [--file <path>] [--dry-run] -- <command...>`
- Lit le fichier `.env` (ou `--file`), résout les références `creds:entry` depuis le Keychain, et lance `<command>` avec l'environnement injecté.
- Les secrets ne transitent **jamais** par stdout/stderr/fichier — ils sont injectés uniquement dans l'environnement du processus enfant.
- `--dry-run` : affiche les noms de variables et leur source (literal ou creds:entry) sur stderr, **sans aucune valeur**.
- Le code de sortie est celui du processus enfant (ou un code creds en cas d'erreur de résolution).
- **C'est la méthode recommandée pour lancer un serveur ou des tests nécessitant des secrets.**

#### `creds rm <entry>`
- Supprime l'entrée du Keychain.
- stdout : vide.
- stderr : confirmation (ex: `Removed namespace/env/name`).

### Options globales
- `--account <string>` : override du compte Keychain (défaut: `$USER`).
- `--timeout-ms <ms>` : timeout en millisecondes (défaut: 10000).

### Convention des entries

Format : `namespace/env/name` — minimum 3 segments, lowercase.

- Caractères autorisés par segment : `[a-z0-9._-]`
- Pas d'espaces, pas de `//`, pas de `/` final, pas de majuscules.
- Exemples valides : `myapp/dev/db_url`, `shared/prod/api_key`, `payments/prod/stripe_secret_key`
- Exemples invalides : `myapp`, `myapp/dev`, `MyApp/dev/key`, `myapp//dev/key`

### Mapping Keychain
- `service = "creds:<entry>"` (ex: `creds:myapp/dev/db_url`)
- `account = $USER` (ou valeur de `--account`)

### Exit codes contractuels

| Code | Signification |
|------|---------------|
| 0 | Succès |
| 1 | Erreur d'usage / validation / arguments |
| 2 | Entrée introuvable |
| 3 | Keychain verrouillé / accès refusé |
| 4 | Erreur inattendue |

En cas d'erreur : stdout est **toujours vide**. Ne jamais tenter de parser stdout sur un code != 0.

---

## 4) Recettes obligatoires (do)

### Lancer un serveur ou des tests avec des secrets (methode recommandee)

Utiliser `creds env` pour injecter automatiquement tous les secrets depuis un fichier `.env` :

```bash
# Lancer un serveur de dev
creds env -- bun run dev

# Lancer les tests
creds env -- bun test

# Fichier .env personnalise
creds env --file .env.test -- vitest run

# Verifier les variables avant de lancer
creds env --dry-run
```

Le fichier `.env` utilise le prefixe `creds:` pour les secrets :

```bash
PORT=3000
DATABASE_URL=creds:myapp/dev/db_url
OPENROUTER_API_KEY=creds:global/dev/openrouter_api_key
```

**Toujours preferer `creds env` aux autres methodes** lorsqu'il y a plusieurs secrets a injecter.

### Injecter un secret unique dans une commande

Pour un seul secret, l'injection inline reste valide :

```bash
OPENROUTER_API_KEY="$(creds get global/dev/openrouter_api_key)" some-command
```

### Exporter dans le shell courant via eval

```bash
eval "$(creds get global/dev/openrouter_api_key --export OPENROUTER_API_KEY)"
```

### Stocker un secret depuis un script

```bash
echo -n "$SECRET_VALUE" | creds set myapp/prod/api_key
```

### Utiliser dans un Shortcut macOS (action "Run Shell Script")

Shortcuts ne charge pas le `PATH` du terminal. Toujours préfixer avec l'export du PATH :

```bash
export PATH=/opt/homebrew/bin:$PATH && creds get global/dev/omdb_api --no-newline
```

### Vérifier qu'une entrée existe avant de l'utiliser

```bash
if creds get myapp/dev/db_url > /dev/null 2>&1; then
  echo "OK"
else
  echo "Entrée manquante" >&2
fi
```

### Dans du code Node.js / TypeScript

```typescript
import { execFileSync } from "node:child_process";

const secret = execFileSync("creds", ["get", "myapp/dev/api_key", "--no-newline"], {
  encoding: "utf-8",
});
// Utiliser `secret` — ne jamais le logger.
```

---

## 5) Anti-patterns (don't)

### Fichier `.env` avec secret en clair

```bash
# INTERDIT
OPENROUTER_API_KEY=sk-or-v1-XXXXXXX

# CORRECT — référence creds, pas de secret en clair
OPENROUTER_API_KEY=creds:shared/openrouter_api_key
DATABASE_URL=creds:myapp/dev/db_url
```

### Secret en argument de commande

```bash
# INTERDIT — échouera ET expose le secret dans l'historique shell
creds set myapp/dev/key sk-or-v1-XXXXXXX
```

### Secret en dur dans un curl ou un script

```bash
# INTERDIT
curl -H "Authorization: Bearer sk-or-v1-XXXXXXX" https://api.example.com

# CORRECT
curl -H "Authorization: Bearer $(creds get global/dev/api_key --no-newline)" https://api.example.com
```

### Logger la valeur

```typescript
// INTERDIT
const key = execFileSync("creds", ["get", "myapp/dev/key", "--no-newline"], { encoding: "utf-8" });
console.log("Clé récupérée:", key);  // FUITE

// CORRECT
console.log("Clé récupérée avec succès");  // Pas la valeur
```

### Export en dur dans un profil shell

```bash
# INTERDIT dans .bashrc / .zshrc
export OPENROUTER_API_KEY="sk-or-v1-XXXXXXX"

# CORRECT — résolution dynamique
export OPENROUTER_API_KEY="$(creds get global/dev/openrouter_api_key)"
```

---

## 6) Rappels Shortcuts macOS

- Shortcuts ne charge pas `.zshrc` : `creds` et `node` ne sont pas dans le `PATH` par défaut.
- Toujours commencer le script par `export PATH=/opt/homebrew/bin:$PATH && ...`
- L'action "Run Shell Script" capture **uniquement stdout**.
- `creds get` n'écrit que la valeur sur stdout — compatible directement.
- Utiliser `--no-newline` pour éviter un `\n` parasite en aval.
- En cas d'erreur, stdout est vide : le Shortcut recevra une chaîne vide.
- Ne jamais afficher le résultat de `creds get` dans une notification ou un dialogue Shortcuts.

---

## 7) Incohérences / à clarifier

- **Entry `shared/openrouter_api_key`** : le README l'utilise comme exemple avec le commentaire "3 segments with implied default", mais c'est bien 3 segments (`shared` / `openrouter` / `api_key` — séparés par `/`). Le `_` est un caractère intra-segment, pas un séparateur. L'exemple est valide mais le commentaire "implied default" est ambigu — il n'y a pas de mécanisme de segment implicite dans l'implémentation.
- **Entry `shared/cert/pem`** : utilisé dans un exemple `--base64` du README. Valide (3 segments), mais diffère de la convention `namespace/env/name` car `cert` ressemble plus à un type qu'à un environnement. Pas bloquant, mais la convention mériterait d'être documentée plus strictement si `env` est vraiment requis comme deuxième segment.
