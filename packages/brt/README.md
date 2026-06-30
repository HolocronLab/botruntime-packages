# brt — botruntime CLI

`brt` is a full fork of [`@botpress/cli`](https://github.com/botpress/botpress)
(MIT), rebranded and repointed at **our** self-hosted cloud
(`https://botruntime.ru`). It keeps the upstream toolchain intact — most
importantly the **native build** (codegen + esbuild bundle) — and targets our
cloudapi, which mirrors the Botpress admin API.

Toolchain: **bun** (the bin runs via `#!/usr/bin/env bun`).

## Run it

```bash
# from this dir
bun src/cli.ts --help
bun src/cli.ts --version

# or install the `brt` bin onto PATH
bun link            # then: brt --help
```

The default host is `https://botruntime.ru` (`src/consts.ts`), overridable per
command with `--apiUrl`, or via env with the `BRT_` prefix (e.g. `BRT_API_URL`,
`BRT_BOTPRESS_HOME`). Profiles live in `$BRT_BOTPRESS_HOME/profiles.json`
(default `~/.brt/profiles.json`).

## Commands

The full upstream command set is preserved:

```
login  logout  bots  integrations  interfaces  plugins  init  generate(gen)
bundle  build  read  serve  deploy  add(i/install)  remove(rm)  dev  lint  chat
profiles
```

`brt build` runs the **native** pipeline — `generate` (typings codegen into
`.botpress/`) followed by `bundle` (esbuild → `.botpress/dist/index.cjs`). It is
not a `bun build` shortcut; it is the upstream Botpress build, repointed.

## Smoke path

```bash
brt login                 # Personal Access Token + workspace, against our cloud
brt init                  # scaffold a bot / integration / plugin
brt build                 # native codegen + esbuild bundle -> .botpress/dist/index.cjs
brt deploy                # build + publish to our cloud (PUT /v1/admin/bots/{id})
```

For an integration project (with `integration.definition.ts`), `brt build`
produces a runnable `.botpress/dist/index.cjs` exporting `{ default, handler }`,
and `brt deploy` publishes the integration.

## Rebrand boundary (hard rule)

brt is rebranded only on our user-facing surface (CLI name `brt`, help/banner
text, default cloud host, `~/.brt` home, `BRT_` env prefix). It does **not**
rename what the runtime/SDK consume:

- `@botpress/*` npm packages (`@botpress/sdk`, `@botpress/client`,
  `@botpress/chat`) — these are the SDK the integrations depend on.
- the `.botpress/` build/output dir and `bp_modules/` install dir the toolchain
  emits and resolves.

Renaming those would break codegen and bundle execution.

## Cloud repoint

The only functional cloud-base config is `src/consts.ts`
(`productionBotpressDomain` + the `default*Url` constants), all pointed at
`https://botruntime.ru`. The cloud commands (`login`, `deploy`, `bots`,
`integrations`, …) use `@botpress/client` against that host; our cloudapi
mirrors the Botpress admin API, so a base-URL repoint is sufficient. Per-endpoint
contract parity is owned by `api/` (the cloudapi server), not this CLI.

## Install from GitHub Packages

```bash
cat > ~/.npmrc <<'EOF'
@holocronlab:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
EOF

bun add -g @holocronlab/brt
brt login
brt init my-bot && cd my-bot && brt build && brt deploy
```

Requires **bun >= 1.3**.
