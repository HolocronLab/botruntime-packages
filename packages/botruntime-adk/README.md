# @holocronlab/botruntime-adk

Fork of `@botpress/adk@2.0.2` (MIT) — core ADK library for building AI agents on
botruntime, rebranded and repointed at the `@holocronlab` package scope.

Every import of an upstream Botpress-scoped package has been repointed at its
botruntime equivalent:

| Upstream | This fork depends on |
| --- | --- |
| `@botpress/sdk` | `@holocronlab/botruntime-sdk` |
| `@botpress/client` | `@holocronlab/botruntime-client` |
| `@botpress/chat` | `@holocronlab/botruntime-chat` |
| `@botpress/cognitive` | `@holocronlab/botruntime-cognitive` |
| `@botpress/runtime` | `@holocronlab/botruntime-runtime` |
| `@bpinternal/zui` | `@holocronlab/botruntime-zui` |
| `@bpinternal/jex` | `@holocronlab/botruntime-jex` |
| `@botpress/analytics` | `@holocronlab/botruntime-analytics` |
| `@botpress/cli` (subprocess) | `@holocronlab/brt` |

## CLI compatibility note

`src/commands/bp-cli.ts` no longer shells out to the upstream `bp` CLI. It
resolves and invokes `@holocronlab/brt`'s `bin.js` (a full fork of the former
`@botpress/cli`) instead, from `~/.adk/bp-cli/<version>/node_modules/@holocronlab/brt/bin.js`.

**Known gap:** as of `@holocronlab/brt@0.2.0`, the published package on GitHub
Packages ships only TypeScript source + `bin.js`; it has no `dist/` directory,
so `bin.js`'s `require('./dist/cli.js')` fails at runtime. The CLI-subprocess
commands (`adk dev`, `adk build`, `adk deploy`, `adk add`, `adk chat`) will not
work end-to-end until `@holocronlab/brt` publishes a built `dist/cli.js`. This
does not affect `bunx tsc --noEmit` or the library build, since nothing in this
package imports brt's JS module graph — it is invoked purely as an external
subprocess.

## Also intentionally deferred

- The generated project scaffold in `agent-init/agent-project-generator.ts`
  drops the upstream `evals` dependency from `adk init` output — there is no
  `@holocronlab/botruntime-evals` fork yet.
- `agent0/index.ts`'s public re-export intentionally omits
  `./capabilities/index.js`; no `capabilities/index.ts` exists in the
  reconstructed source, and upstream's own published `dist/agent0/` has no
  compiled `capabilities/index.js` either (only static prompt/skill assets),
  so the type-declaration re-export in upstream's `dist/agent0/index.d.ts` is
  itself a dangling reference.
