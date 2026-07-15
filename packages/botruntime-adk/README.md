# @holocronlab/botruntime-adk

The agent development engine for botruntime. This package is a **library**, not
a second command-line tool: it exports project loading, generation, dependency
reconciliation, type generation, and runtime helpers used in-process by `brt`.

`brt` is the only executable in the developer workflow:

```bash
brt dev
brt dev --check
brt deploy --adk
```

The CLI calls this package directly; it does not shell out to an `adk`, `bp`, or
Botpress executable. This boundary is the accepted architecture in
[ADR-0006](../../docs/adr/0006-single-cli-brt-engines-mcp.md).

## Package surface

- `@holocronlab/botruntime-adk` — agent project and generation APIs.
- `@holocronlab/botruntime-adk/dependencies` — target-scoped dependency
  snapshots, readiness reconciliation, migration, and resolver APIs.
- Internal subpaths are reserved for `brt` and are not a public CLI contract.

## Build and publication

The repository builds executable ESM and declarations into `dist/`:

```bash
bun run check:type
bun run test
bun run build
```

`prepublishOnly` verifies the required JavaScript entry points before release.
The package is published publicly through `https://registry.npmjs.org` and
includes `dist/`, `package.json`, and this README. The current source version is
declared in `package.json`; a registry release should be verified on npmjs
rather than inferred from the repository alone.

## Developer documentation

- [Dev and production workflow](https://botruntime.ru/docs/cli/development)
- [Dependency state internals](https://botruntime.ru/docs/cli/dependency-state)
- [CLI reference](https://botruntime.ru/docs/cli/reference)

The package is derived from the MIT-licensed Botpress ADK library and repointed
to the `@holocronlab/botruntime-*` runtime stack. See `LICENSE` for attribution.
