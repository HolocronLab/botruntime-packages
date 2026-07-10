# {{projectName}}

A minimal Holocron agent project.

## Run it

```bash
{{packageManager}} install
brt dev
```

After the first successful development run, check the same target without
changing remote state:

```bash
brt dev --check
```

Validate TypeScript and deploy the production target:

```bash
tsc --noEmit
brt deploy --adk
```

Edit `agent.config.ts` for project metadata and
`src/conversations/index.ts` for behavior.
