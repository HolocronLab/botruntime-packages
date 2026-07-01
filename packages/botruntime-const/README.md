# @holocronlab/botruntime-const

Minimal reimplementation of the handful of symbols brt needs from the
upstream `@bpinternal/const` package:

- `prefixToObjectMap` — a map from resource-id prefix (e.g. `bot_`, `kb_`) to
  its object type name.
- `FileId` — the branded `` `file_${string}` `` id type, derived the same
  way upstream derives it (from `objectToPrefixMap` via a generic `Ids`
  mapped type).
- `limitConfigs` — static per-resource size/count limits (e.g.
  `state_item_payload_bytes`), keyed the same as upstream.

The upstream package ships ~40 additional files of internal Botpress billing
configuration (plans, meters, addons, quotas, etc.) that are not used here.
This package reproduces only the three symbols above, faithfully (same keys,
same values), as plain `const` objects — no schema/validation dependency is
needed since brt only reads plain values off of them.

## Usage

```ts
import { prefixToObjectMap, FileId, limitConfigs } from '@holocronlab/botruntime-const'

Object.keys(prefixToObjectMap) // ['accnt', 'accntpf', 'action', ..., 'bot', ..., 'kb', ...]

const id: FileId = 'file_abc123'
limitConfigs.state_item_payload_bytes.value // 131072
```

## License

MIT (see `LICENSE`). Derived from Botpress Technologies, Inc.'s
`@bpinternal/const` package.
