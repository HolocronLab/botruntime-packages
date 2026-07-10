# {{projectName}}

A small Holocron agent that greets users on any configured channel.

## Run it

```bash
{{packageManager}} install
brt dev
```

After the first successful development run, check readiness without changing
remote state:

```bash
brt dev --check
```

Validate TypeScript and deploy the production target:

```bash
tsc --noEmit
brt deploy --adk
```

The interactive `brt chat` command is experimental and starts a new
conversation; use a real configured channel for acceptance testing.
