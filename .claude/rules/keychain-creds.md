# creds — Behavioral Guards

These guards apply whenever `creds` is used in this project. They are non-negotiable and complement the `/creds` skill.

## Absolute Prohibitions

- **Never** use `child_process.exec()` to call `security` or `creds`. Always use `execFile()`.
- **Never** build a shell command by string concatenation. Use argument arrays.
- **Never** log the value returned by `creds get`. Not even partially, not even truncated.
- **Never** pass a secret as a CLI argument: `creds set entry value` is forbidden and will fail.
- **Never** write a secret in plaintext in any file (.env, script, test, config, YAML, JSON).
