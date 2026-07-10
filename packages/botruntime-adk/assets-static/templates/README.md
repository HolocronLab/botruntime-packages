# Holocron agent starters

These static starters are consumed by the project generator and copied into a
new agent directory. The registry contains only starters covered by generator
smoke tests.

Each starter supplies `agent.config.ts`, a conversation handler, and a short
README. The generator adds `package.json`, `tsconfig.json`, `.gitignore`, and
assistant instructions.

Generated projects expose these scripts:

```text
brt dev
brt dev --check
tsc --noEmit
brt deploy --adk
```

`brt dev --check` is read-only and is useful only after a successful stateful
development run has created the local target metadata.
