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
profiles  link  logs  traces  conversations  eval  config  secret
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

## Upgrade an installed integration

`brt integrations install <name@version>` only creates a new connection. To
move one existing ADK agent installation to another published exact version,
use `upgrade`:

```bash
# Production target from agent.json; alias defaults to the integration name
brt integrations upgrade telegram@1.2.0 --alias primary
brt deploy --adk

# Development target previously established by brt dev
brt integrations upgrade telegram@1.2.0 --alias primary --dev

# Explicit rollback is the same atomic operation targeting the former version
brt integrations upgrade telegram@1.1.3 --alias primary
```

The command accepts only canonical exact SemVer refs. It lists the selected
bot's installations and resolves exactly one current installation by effective
alias. An explicit stored alias has priority. If the stored alias is empty, as
with a default `install`, the canonical integration name or its unqualified last
segment can select it. Missing and ambiguous matches fail before mutation. The
command rejects an already-current ref, then sends one atomic direct repoint
request. There is no separate preflight endpoint. Cloud validates catalog
trust, publication, stored config/secrets, and webhook authentication
compatibility inside the repoint transaction. Any non-2xx response leaves
local project files unchanged.

Cloud atomically repoints the existing installation: installation ID, alias,
webhook ID, status, and credentials are preserved, and no second installation
is created. The CLI never calls `register` automatically.

After repoint, the selected dev or production dependency snapshot is refreshed.
A running dev watcher picks up its dev snapshot; production always requires the
next `brt deploy --adk`. `--wait` is retained in the command surface but rejected
before target lookup or mutation: Cloud does not yet expose runtime-host
readiness. A local refresh error after a successful repoint exits non-zero while
stating that server-side repoint already completed and printing the symmetric
rollback command.

The repoint POST is non-idempotent. Only a Cloud `4xx` is a definitive rejection.
If the connection drops, a successful response is malformed or inconsistent,
or any `5xx` is returned, the CLI reports the outcome as unknown and leaves
local files unchanged. Inspect the installation's current ref first; only if the
target ref is active should you use the printed shell-safe rollback command. Do
not create or register a second installation during recovery.

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

## Install from npmjs

```bash
bun add -g @holocronlab/brt
brt login
brt init my-bot && cd my-bot && brt build && brt deploy
```

Requires **bun >= 1.3**.

## Runtime logs

`brt logs` reads the selected bot through the workspace profile. Production
uses the canonical project link or a numeric `--bot-id` override. `--dev`
resolves the cached opaque runtime target, or an opaque `--bot-id` override,
and queries its attested numeric target bot. Passing an opaque runtime ID
without `--dev` remains a production-target error.

```bash
brt logs --follow
brt logs --conversation-id conv_123 --dev
brt logs --since 2026-07-17T18:00:00Z --dev --local
```

## Runtime traces

`brt traces` reads the selected profile's trace API. It returns the complete
stored span content, including attributes, platform payload, tool input/output
and runtime exceptions. Trace content is not redacted: the bot developer owns
the data sent by their bot and must delete traces when they are no longer needed.
Access remains scoped to the selected workspace and bot.

```bash
# Production target from agent.json (or bot.json for a classic project)
brt traces --conversation-id conv_123
brt traces conversation=conv_123 error since=1h

# Attested dev target created by brt dev; --local selects the local stack/profile
brt traces --conversation-id conv_123 --dev
brt traces --conversation-id conv_123 --dev --local

# Botpress-compatible tokens; workflow/action match rows, trace drills into a tree
brt traces conversation=conv_123 workflow=onboarding
brt traces conversation=conv_123 trace=0123456789abcdef0123456789abcdef
brt traces conversation=conv_123 trace=0123456789abcdef0123456789abcdef --verbose

# Extended typed API filters; --no-error selects effective non-error rows
brt traces --conversation-id conv_123 --status ok --source otlp --name autonomous.tool
brt traces --conversation-id conv_123 --no-error --action lookup-order

# Stable machine output and resumable cursor pagination
brt traces --conversation-id conv_123 --limit 100 --json
brt traces --conversation-id conv_123 --limit 100 --next-token 456 --json
```

Supported compatibility tokens are `error`, `conversation=<id>`,
`workflow=<name>`, `action=<name>`, `trace=<id>`, `since=<duration>`,
`until=<duration>`, and `limit=<n>`. Relative durations such as `30s`, `5m`,
and `1h` are converted once to absolute RFC3339 bounds. Equivalent named flags
are available, together with `--status`, `--source`, and `--name`. A conversation
is required unless `workflow`, `action`, or exact `trace` is provided; unscoped
workflow/action queries also require `since`. Use a returned `traceId` with
`trace=<id>` to fetch its full tree.

Human output prints tool input/output plus the exception code and message for
failed spans; `--verbose` also prints the stack and complete attributes/payload.
JSON output always includes the complete stored span content.

The cloud API deliberately does not provide unscoped listing or follow mode.
`trigger` remains unavailable until the server exposes a bounded typed trigger
name. `include-llm` is unnecessary and rejected: hosted output already contains
the attributes and payload stored by the platform.

Production requires canonical positive-decimal `workspaceId` and `botId`
coordinates matching the selected profile. Development requires an opaque,
stack-scoped runtime target previously established by `brt dev`; it never
silently falls back to production or to a default workspace. Authentication,
target, network, HTTP, and response-shape failures exit non-zero with no partial
trace output.

## Privacy-safe conversations

`brt conversations` follows the current Botpress ADK CLI command shape with
separate `list` and `show` operations, but reads the selected cloud target
instead of a local SQLite trace store. Conversation tags and message content
are never printed. `show` builds a compact typed timeline; use `brt traces` for
the complete stored span.

```bash
# Production target from the canonical project link
brt conversations list
brt conversations list limit=5 since=1h
brt conversations show conv_123

# Attested development target; --local only selects the linked stack
brt conversations list --dev
brt conversations show conv_123 --dev --local

# Stable machine output and resumable list pagination
brt conversations list --limit 100 --json
brt conversations list --limit 100 --next-token 456 --json
brt conversations show conv_123 --json
```

`list` accepts Botpress-compatible `limit=<n>` and `since=<duration>` tokens;
the equivalent named flags are also available. `--next-token` resumes from the
strict positive-decimal server cursor. JSON list output contains only `id`,
timestamps, `channel`, `integration`, and `messageCount`. JSON show output
contains grouped trace IDs, timestamps, duration, typed status, typed trigger,
tool metadata, and bounded error kinds. It never includes prompts, model
responses, tool input/output, documents, message payloads, or conversation
tags. Use `brt traces conversation=<id> trace=<traceId> --verbose` to inspect the
full bounded exception diagnostics for a failed turn.

The Botpress local-only `--include-llm` option is absent because hosted
`brt traces` already returns stored attributes/payload. Production and
development use the same fail-loud canonical target and profile-auth rules.

## Hosted evals

`brt eval` follows the current Botpress ADK eval/run-history shape while using
the hosted runtime workflow and bounded cloud persistence. A bare
`brt eval [name]` and the explicit `brt eval run [name]` both start the deployed
`builtin_eval_runner`; `runs` lists or inspects persisted results.

```bash
# Sync local evals/manifest + private fixtures, then run the hosted workflow
brt eval run
brt eval greeting
brt eval run greeting --tag smoke --type regression
brt eval run --judge-model openai:gpt-4o
brt eval run --repeat 10 --max-concurrency 2 --min-pass-rate 0.9

# Keep the tunnel runtime connected in terminal 1
brt dev

# Target that attested dev runtime from terminal 2
brt eval run --dev
brt eval runs --dev --latest

# Hosted history, detail, pagination, and stable machine output
brt eval runs --limit 10 --status completed
brt eval runs 101 --verbose
brt eval runs --latest --json
brt eval runs --limit 10 --next-token MTAw --json
```

Production requires the canonical positive-decimal project link and the
per-bot key saved by `brt link --key-stdin` or provisioning. Development uses
the selected profile PAT narrowed by the opaque runtime bot identity previously
attested by `brt dev`. `--local` is accepted only together with `--dev`, so the
two authority modes cannot be mixed implicitly.

`brt eval run --dev` executes against the live tunnel bot. Keep `brt dev`
running in another terminal for the run. After a live tunnel disconnects, the
CLI coalesces duplicate close/error signals and retries with bounded exponential
backoff for up to 120 seconds. Exhausting that budget fails loudly.

Interactive Chat uses the same explicit target model:

```bash
brt chat          # production target from the canonical link and per-bot key
brt chat --dev    # attested dev runtime and profile PAT
```

The CLI ensures the exact compatible first-party Chat integration in the
selected environment. `--local` is valid only together with `--dev`.

On botruntime cloud, `brt dev` links the isolated development runtime to the
canonical production bot shown in the console. The link is also restored for
an existing development target the next time `brt dev` starts. The development
bot keeps its runtime ID and hosted eval history; production and development
data remain separate and the console only groups them for navigation.

Repeated attempts are isolated runs; the aggregate
contains pass rate, stable/flaky classification, p50/p95 duration, and a
failure histogram keyed only by assertion kind. Fixture contents, signed URLs,
actor messages, and tool payloads are excluded from the manifest result and
aggregate output.

The machine envelope has `schemaVersion: 1` and only allowlisted target, run,
entry, verdict, timing, error-kind, and typed assertion metadata. Prompts,
user/bot messages, model responses, evidence, tool input/output, documents,
raw evaluator errors, and raw workflow failure reasons are never written to
stdout or stderr. A failed suite still prints its safe result, then exits
non-zero. Auth, target, network, HTTP, cursor, timeout, and malformed-response
failures also exit non-zero with remediation.
