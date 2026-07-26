# Agents as Code: план устранения функциональных пробелов

Status: In progress
Owner CLI/SDK: `botruntime-packages`
Owner control plane: `Botforge`
Last updated: 2026-07-26
Related decision: [ADR-0006](./adr/0006-single-cli-brt-engines-mcp.md)
Botforge coordination task: `codex://threads/019f9c08-8b04-7ef3-8869-6f94cdd76048`
Companion Botforge plan: `docs/platform-files-foundation-v1.md` in branch
`codex/platform-files-foundation-v1`

## Цель

Дать разработчику агентов в коде один инструмент — `brt` — с возможностями,
сопоставимыми с Botpress ADK 2.x там, где они относятся к agent-as-code:

- одноразовые скрипты с полным runtime-контекстом;
- durable workflows с запросом данных у пользователя, notify/callback и
  наблюдаемой историей запусков;
- полный lifecycle зависимостей агента;
- assets, knowledge bases, secrets и модели;
- безопасные файловые примитивы для модели и durable processing;
- MCP как второй фасад над теми же операциями;
- работа с пользовательскими файлами через Files API.

Agent0, отдельный `adk`-бинарь, Dev Console/UI, self-update, theme и telemetry в
этот план не входят.

## Неподвижные архитектурные решения

1. `brt` остаётся единственным CLI. Команды Botpress `bp` и `adk` не
   воспроизводятся отдельными бинарями.
2. `brt dev` и `brt run` имеют разные контракты:
   - `brt dev` — долгоживущий build/watch, локальный worker, reverse tunnel,
     callback receiver и поток диагностик;
   - `brt run <script> [...args]` — одноразовый локальный процесс с runtime
     context выбранного dev/prod target, без сервера, tunnel и watch.
3. Команды CLI — тонкие фасады над переиспользуемыми TypeScript engines.
   Будущий MCP-сервер вызывает тот же command-core, а не shell-out в `brt`.
4. Durable workflow engine не переписывается. Источником истины остаются
   persisted `workflowState`/`workflowSteps` и существующие runtime handlers
   yield/resume/callback.
5. Для первого workflow CLI используются существующие Botforge runtime API:
   `/v1/chat/workflows` и state API. Новый backend вводится только если
   имеющегося контракта недостаточно для безопасной пагинации/проекции.
6. Production и development никогда не смешиваются неявно. Dev target
   аттестуется по opaque runtime id и numeric storage target; prod target
   берётся из canonical `agent.json`.
7. Stored production secrets не экспортируются на машину разработчика.
   `brt run` наследует локальное окружение; dev-run дополнительно получает
   config vars тем же путём, что и `brt dev`.
8. Files API — только физический слой. Платформа также владеет immutable
   `FileRef`, файлами текущего turn, безопасной передачей модели, производными
   файлами и lineage. Логические документы и доменные факты остаются в
   приложении.
9. Любая тяжёлая файловая операция является durable job: с idempotency key,
   progress, retry policy, timeout, cancellation и persisted result. Размер
   deployment не влияет на семантику API.
10. Универсальная POSIX-песочница `/workspace` — отдельная capability с
   изоляцией и квотами, а не скрытое расширение Files API.
11. Hosted history и diagnostics остаются privacy-safe по умолчанию. Полные
   payload/state не должны случайно попасть в list/output/logs.
12. Любой новый публичный CLI-контракт обновляет CLI docs contract и
    пользовательскую документацию в том же release train.
13. Все возможности проектируются для multi-tenant эксплуатации: тысячи ботов,
    тысячи пользователей на бота, горизонтальное масштабирование и отсутствие
    process-local состояния как источника истины.

## Что уже есть

### Durable workflows

Runtime уже поддерживает:

- typed `step.request(...)` и `provide(...)`;
- `step.notify(...)`;
- retries, sleeps, subworkflows и nested steps;
- heartbeat/checkpoint, yield и resume;
- completed/failed callbacks;
- persisted output, attempts, request/notification name, timestamps и error.

Следовательно, workflow-пробел сейчас преимущественно в developer surface и
наблюдаемости, а не в runtime execution engine.

### Engines без CLI-фасада

В `@holocronlab/botruntime-adk` уже существуют:

- `ScriptRunner`;
- dependency manager: list/get/add/remove/enable/disable/configure/diff/apply/copy;
- assets manager: local/remote plan и apply;
- knowledge manager: sync plan и execute.

### Files

Входящие пользовательские файлы сохраняются в Files API и доходят до агента
как стабильный `fileId` с metadata. Runtime умеет native PDF/image attachments.

Этого недостаточно для универсальной передачи файла модели: current-turn
membership, immutable content identity, page coverage, derivation и
идемпотентная тяжёлая обработка пока не оформлены как единый платформенный
контракт.

Botforge-аудит уточнил критичный storage gap: текущая строка `file` является
mutable latest-pointer, а публичный/internal `FileRef` не содержит stable
generation. При overwrite старый blob best-effort удаляется. Поэтому durable
lineage/inspect нельзя безопасно строить поверх текущего `id` отдельной
«подготовительной» таблицей: первым backend-срезом обязан быть целостный
generation substrate с dual-write, retention/GC и legacy canonicalization.

## Целевая поверхность `brt`

Команды ниже описывают целевой контракт. Точные названия flags фиксируются
тестами и generated docs contract.

## Общий platform gate для любой возможности

Каждый новый primitive/API/command до реализации отвечает на одни и те же
вопросы:

- какой tenant и actor владеют ресурсом, где это проверяется;
- как обеспечены idempotency, concurrency control и повторная доставка;
- где persisted source of truth и как процесс возобновляется после рестарта;
- какие cursor pagination, indexes, bounded limits и retention применяются;
- какие quotas/rate limits/backpressure защищают соседних ботов;
- как выполняются cancellation, timeout, retry и dead-letter recovery;
- какие audit, metrics, traces и privacy-safe diagnostics доступны оператору;
- как меняется схема без одновременного обновления тысяч deployment;
- как проверяются cross-tenant isolation и noisy-neighbor behavior;
- как считается и ограничивается стоимость тяжёлой операции.

Process-local map, неограниченный list, polling без deadline, полный payload в
логах и одна глобальная очередь без tenant fairness не проходят этот gate.

### Wave 1 — scripts и workflows

- `brt run <script> [...args] [--prod] [--force]`
- `brt workflows run <name> [--input-file <json>] [--timeout <ms>]`
  `[--workflow-timeout <ms>] [--idempotency-key <key>] [--no-wait]`
- `brt workflows list [--status ...] [--limit ...] [--next-token ...]`
- `brt workflows show <workflow-id> [--steps] [--include-data]`
- `brt workflows wait <workflow-id> [--timeout <ms>] [--steps]`

`run` по умолчанию использует уже созданный dev target. `--prod` выбирает
canonical prod target. Команда обязана падать до запуска пользовательского кода,
если target/config/dependencies не удалось достоверно подготовить.

Workflow `--timeout` — только bounded observation window CLI и никогда не
отменяет durable process. Отдельный `--workflow-timeout` задаёт persisted
execution deadline. Истечение observation возвращает exit code 2 и команду
продолжения; failed/timedout/cancelled terminal state — exit code 1.

Workflow list/show выводят metadata и безопасную step-проекцию. Сырые
произвольные state/payload показываются только через явно спроектированный
контракт, а не универсальный dump.

### Wave 2 — dependencies и secrets

- `brt dependencies list|get|add|remove|enable|disable|configure|diff|apply|copy`
- `brt secret list|status|rm`

Семантика не смешивает:

- удаление registry definition (`brt integrations|plugins delete`);
- удаление installation с target (`brt dependencies remove`);
- уже существующий shortcut `brt integrations install`.

### Wave 3 — assets и knowledge

- `brt assets list|sync|delete`
- `brt knowledge list|get|create|sync|delete`
- `brt deploy --adk` применяет asset/knowledge plans вместе с table plan.

Все destructive plans сначала печатаются; неинтерактивное destructive
применение требует отдельного явного opt-in.

### Wave 4 — platform files

#### Контракт

```ts
type FileRef = {
  id: string
  generation: string
  checksum: string
  size: number
  contentType: string
  filename?: string
}

type TurnFiles = {
  eventId: string
  files: FileRef[]
}
```

- `FileRef` неизменно адресует одни и те же байты. Замена содержимого создаёт
  новый ref/generation.
- `TurnFiles` строится из текущего входящего event, а не из transcript.
  Runtime, модель и tools получают один набор.
- Исторический файл доступен только через явно выданный application capability.
- `files.inspect` принимает только разрешённые `FileRef`/page ranges и typed
  output schema. Он возвращает model/prompt version, coverage и unread pages,
  ничего не записывает в доменное состояние.
- `files.derive` создаёт новый immutable `FileRef`, фиксирует source ref,
  page ranges/operation и checksum результата.
- Ordered `FileCollection` покрывает albums и multi-message uploads, но не
  объявляет их одним логическим документом.

#### Масштаб и безопасность

- tenant scope (`workspaceId`, `botId`) проверяется на каждом read/write/job;
- object key не выводится из пользовательского filename;
- bytes передаются stream/range/chunks, а не целиком через память worker;
- upload/inspect/derive имеют size/page/time/cost quotas и rate limits;
- jobs выполняются через durable queue с backpressure и per-tenant fairness;
- idempotency key включает tenant, source checksum, page selection, schema hash,
  model и prompt version;
- list/history всегда cursor-paginated и опираются на tenant/status/time indexes;
- signed URLs короткоживущие, purpose-bound и не попадают в durable state/logs;
- malware/content checks, encryption, retention/legal hold и deletion cascade
  являются control-plane policy;
- audit/metrics содержат IDs, размеры, latency, coverage и cost, но не байты и
  извлечённые персональные данные;
- callback/notify публикуются из persisted job state через outbox, чтобы
  повторная доставка не дублировала доменный результат.

#### Граница с приложением

Платформа не определяет, что файл является ДДУ, паспортом или доверенностью.
Приложение хранит logical document, owner, page ranges, completeness, version и
supersession. Типовой процесс:

`FileRef → durable inspect → typed manifest → mechanical validation → logical documents`.

Механическая validation проверяет существование/пересечение/coverage страниц,
неизменность source checksum, tenant ownership и idempotency. Семантическую
классификацию выполняет модель, доменную регистрацию — приложение.

#### Поставка

1. Slice A: immutable generation substrate, upload dual-write, retained/gone
   lifecycle, bounded GC и exact-generation tenant tests;
2. Slice B: versioned FileRef resolve/range/purpose-bound capability API;
3. Slice C: durable file-operation kernel, dedicated long-job lane,
   workspace→bot fairness, quotas, cancel/retry/outbox и cursor history;
4. Slice D: один end-to-end inspect adapter с typed schema, coverage и
   execution snapshot;
5. Slice E: один deterministic derive transform с atomic publication и lineage;
6. Slice F: TurnFiles handoff — совместная поставка Botforge,
   `botruntime-packages` и runtime-host;
7. ordered collections и migration application-local runtimes после базовых
   vertical slices.

Backend-код не начинается с фиктивного endpoint или заранее созданных
lineage/job tables. Exit gate Slice A: overwrite того же key оставляет старое
поколение читаемым до retention, stale/foreign refs отклоняются, а ambiguous
pointer flip не теряет generation.

### Wave 5 — models

- Botforge возвращает реальный доступный catalog, а не одну
  platform-configured модель;
- `brt models` показывает provider/model, capabilities и availability;
- runtime selection/fallback продолжает принимать dynamic selector.

Backend owner: Botforge. Runtime-host менять не требуется, пока каталог является
control-plane discovery, а не новой execution policy.

### Wave 6 — MCP

- reusable command-core отделён от yargs и terminal rendering;
- `brt mcp` запускает stdio/SSE server;
- `brt mcp:init` создаёт безопасную конфигурацию клиента;
- MCP и CLI используют одинаковые target resolution, auth, validation и
  privacy policy.

### Отдельный RFC — filesystem workspace

Если продукту нужна настоящая файловая песочница для агентского кода, RFC должен
описать:

- lifecycle ephemeral workspace;
- загрузку `fileId` в workspace и обратную публикацию артефактов;
- path traversal/symlink/process/network isolation;
- CPU/RAM/disk/time quotas;
- retention, malware scanning и audit;
- изменения runtime primitives, Botforge control plane и runtime-host.

До принятия RFC Files API не называется POSIX sandbox.

## Границы репозиториев

| Возможность | `botruntime-packages` | Botforge | runtime-host |
| --- | --- | --- | --- |
| `brt run` | CLI adapter, runner hardening, tests/docs | — | — |
| workflow run/show/wait | CLI/client/projection | только при доказанном API gap | — |
| workflow engine/HITL/callback | уже реализовано | persisted API уже есть | уже реализовано |
| dependency lifecycle | CLI над ADK manager | существующий admin API | — |
| assets/knowledge | CLI + deploy wiring | существующие Files/KB API | — |
| secrets list/status/rm | CLI/client | существующий config-var API | — |
| immutable FileRef/TurnFiles | runtime types/context | storage/event contract | event injection |
| files.inspect/derive/jobs | typed primitives/client | metadata, queue, policy, outbox | isolated executor |
| model catalog | CLI/types | dynamic catalog endpoint | — |
| MCP | command-core + server | — | — |
| POSIX workspace | runtime primitives/client | lifecycle/control plane | sandbox executor |

## Порядок поставки и критерии готовности

### 1. Scripts

- [x] public `brt run` command registered and documented;
- [x] dev/prod target selection covered by tests;
- [x] dev config vars/secrets have the same precedence as `brt dev`;
- [x] configuration/auth/network failures are fail-loud;
- [x] child exit code and SIGINT/SIGTERM are preserved;
- [x] package-local targeted tests, typecheck and docs contract pass in the
  isolated registry-dependency validation copy.

### 2. Workflow observability

- [x] typed create/get/list client methods;
- [x] run/show/wait/list commands with bounded polling;
- [x] observation timeout does not shorten create deadline; polling uses capped
  exponential jitter instead of a synchronized fixed interval;
- [x] typed status and timestamp validation;
- [x] safe default output and stable `--json` schema;
- [x] dev opaque target and prod bot target tests;
- [ ] Botforge metadata-only workflow list projection, so list never transfers
  arbitrary input/output/tags before the CLI projection;
- [ ] Botforge bounded step projection for inline and swapped state, with
  cursor/depth/count limits and no output/error text/file location;
- [ ] durable server-side idempotency record with request fingerprint conflict
  detection and retention; the first CLI slice uses get-or-create tags plus a
  verified `brt.requestHash`;
- [ ] live smoke on disposable dev target before release.

### 3. Dependencies, secrets, assets and knowledge

- [ ] engines exposed through command-core;
- [ ] dry plan before mutations;
- [ ] target snapshots refreshed only after verified persistence;
- [ ] `deploy --adk` cannot report success before table/assets/KB plans finish;
- [ ] docs and migration examples.

### 4. Platform files

- [x] versioned Botforge audit/plan с threat model и tenant authorization
  matrix;
- [x] FileRefV1/TurnFilesV1/FileOperationV1 contracts, data model,
  compatibility order и repository boundaries;
- [ ] Slice A: generation schema, upload dual-write, retention/GC,
  legacy canonicalization и PostgreSQL integration tests;
- [ ] Slice B: exact-generation range/capability API;
- [ ] Slice C: durable job/outbox implementation, idempotency, cancellation,
  workspace→bot fairness и admission control;
- [ ] size/page/time/cost quotas и per-tenant backpressure tests;
- [ ] inspect result содержит exact coverage/unread pages/model/prompt version;
- [ ] derive lineage и deletion/retention semantics;
- [ ] Slice F: bounded TurnFiles handoff through packages/runtime-host;
- [ ] нагрузочный тест без unbounded memory и cross-tenant leakage;
- [ ] disposable multi-bot acceptance.

### 5. Models

- [ ] Botforge API contract and tests;
- [ ] at least two configured models/capability variants in integration test;
- [ ] `brt models --json` contract test;
- [ ] runtime selection smoke with fallback.

### 6. MCP

- [ ] no shell-out;
- [ ] same auth/target/privacy tests as CLI;
- [ ] read tools separated from mutations;
- [ ] protocol and client smoke.

## Release gate

Работа не считается завершённой только по локальным тестам. Для каждой wave:

1. package/backend tests and typecheck;
2. generated CLI docs contract;
3. PR/CI/merge;
4. npm/backend deploy as applicable;
5. installed `brt --help` and command smoke;
6. disposable dev target acceptance;
7. production endpoint/version verification where backend changed.

Непроверенный хвост отмечается явно.

## Журнал решений и прогресса

### 2026-07-26

- Подтверждено: `brt` — гибрид полезных поверхностей `bp` и `adk`, но остаётся
  одним CLI.
- Agent0 исключён.
- `brt run` отделён от `brt dev` как one-shot script execution.
- Workflow execution engine признан достаточным; первая реализация
  observability идёт через существующие API.
- Dynamic model catalog остаётся отдельной Botforge-подзадачей после файлового
  foundation.
- Files API признан физическим слоем, а не полным model-file runtime.
- В план добавлены immutable FileRef, TurnFiles, durable inspect/derive,
  lineage, quotas, outbox и multi-tenant isolation.
- Первой Botforge-подзадачей назначен аудит файлового control plane и
  реализация минимального безопасного foundation без application semantics.
- Реализован `brt run`: dev/prod target, strict configuration, config-var
  precedence, exit-code propagation, signal supervision, tests/docs/changeset.
- Реализован первый `brt workflows` slice: idempotent run, request fingerprint,
  cursor list, show/wait, separate observation/execution deadlines, stable JSON,
  safe step projection и response/input bounds.
- Доказано, что существующий Botforge API недостаточен для release-grade
  observability больших deployment: list переносит полные payload, а
  `workflowSteps` может быть swapped file до 100 MB. Backend contracts
  metadata-only list и bounded step projection переданы Botforge-помощнику.
- Botforge-аудит завершён на baseline
  `9336bc71942ed0adbdcc50c4beecc633aa26a419`: Files API tenant-scoped и
  streaming, jobs/outbox durable, но `file` хранит mutable latest-pointer,
  stable generation/TurnFiles relation отсутствуют, а fairness требует уровня
  workspace→bot и отдельного long-job lane.
- В companion plan зафиксированы FileRefV1, TurnFilesV1, inspect/derive,
  operation/outbox/lineage schemas, threat model, quotas/indexes и migration
  slices A–F. Первый безопасный backend change — Slice A целиком; намеренно не
  создана ложная foundation из таблиц, ссылающихся на удаляемые поколения.
- Backend-помощник отдельно подтвердил три release-blocker для workflow CLI:
  metadata-only history endpoint с tenant/status/time indexes, bounded
  privacy-safe step projection и durable start idempotency record с
  fingerprint/409/retention. Текущие CLI bounds/requestHash остаются
  migration guardrails, а не полной платформенной приёмкой.
- Pre-push review устранил два локальных риска переходного CLI: create request
  получил самостоятельный bounded deadline, а wait polling — jittered
  exponential interval. Polling полного workflow record остаётся временным
  fallback до metadata-only status/history backend contract.
