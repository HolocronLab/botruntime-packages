# botruntime-packages

Public packages for the **botruntime** platform. MIT-derived from [Botpress](https://github.com/botpress/botpress).

The proprietary platform (cloudapi backend, bot domain) lives in a separate private repo; only the
public, reusable pieces live here.

## Contents

| Package | What |
|---|---|
| `packages/brt` | The `brt` CLI — a fork of `@botpress/cli` repointed to the botruntime cloud (native `build` = codegen + bundle, `deploy`, `integrations`, …). |
| `integrations/telegram` | Telegram channel integration (fork of `@botpress/telegram`), patched for the botruntime cloudapi. |
| `integrations/megaplan` | Megaplan CRM integration. |
| `integrations/yadisk` | Yandex.Disk storage integration. |

Bundles are built with `brt build` (the native Botpress pipeline) and published to the botruntime
cloud catalog via `brt integrations publish`; the runtime-host pulls them by ref.

## License

MIT. Portions derived from Botpress (`@botpress/cli`, `@botpress/telegram`), also MIT.
