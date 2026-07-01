# @holocronlab/botruntime-const

Minimal reimplementation of the single symbol brt needs from the upstream
`@bpinternal/const` package: `prefixToObjectMap`, a map from resource-id
prefix (e.g. `bot_`, `kb_`) to its object type name.

The upstream package ships ~40 additional files of internal Botpress billing
configuration (plans, meters, addons, quotas, etc.) that are not used here.
This package reproduces only `prefixToObjectMap`, faithfully (same keys, same
values), as a plain `const` object — no schema/validation dependency is
needed since brt only reads `Object.keys(prefixToObjectMap)`.

## Usage

```ts
import { prefixToObjectMap } from '@holocronlab/botruntime-const'

Object.keys(prefixToObjectMap) // ['accnt', 'accntpf', 'action', ..., 'bot', ..., 'kb', ...]
```

## License

MIT (see `LICENSE`). Derived from Botpress Technologies, Inc.'s
`@bpinternal/const` package.
