# @holocronlab/botruntime-analytics

Minimal fork of `@botpress/analytics` (MIT). The original package bundles
PostHog event tracking, error sanitization and the `AdkError` base error
class. `@holocronlab/botruntime-adk` only ever imported `AdkError` and
`isAdkError` from it, so this fork keeps just that: the shared base error
class used across the botruntime-adk typed error hierarchy.

## License

MIT — see [LICENSE](./LICENSE). Portions Copyright (c) 2026 HolocronLab.
