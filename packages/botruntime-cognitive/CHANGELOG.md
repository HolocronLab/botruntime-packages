# @holocronlab/botruntime-cognitive

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-cognitive`.

Wrapper around `@holocronlab/botruntime-client` for calling LLMs, forked as part of the
`@botpress/runtime` dependency closure (zero-`@botpress` cascade, 6495425). See README.md.

## 0.8.4 (current) — 2026-07-23

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.48.0

## 0.8.3 — 2026-07-23

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.47.2

## 0.8.2 — 2026-07-22

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.47.1

## 0.8.1 — 2026-07-22

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.47.0

## 0.8.0 — 2026-07-20

- `generateContent` пробрасывает `conversationId` в тело cognitive-запроса
(`InputProps`/`CognitiveRequest`), а `InstrumentedCognitive` инжектит активный
conversationId из runtime-контекста (явно переданный выигрывает; спан и запрос
получают один и тот же id). Гейтвей (cloudapi) строит из него `session_id`
sticky-роутинга провайдер-кэша промпта — без поля кэш-стикинес не активируется.
Для потребителей поле опционально, поведение без него не меняется.

## 0.7.2 — 2026-07-19

- Preserve exact HTTP error envelopes through Bun-safe Cognitive v2 transport normalization, and disable automatic retries for non-idempotent generation requests.

## 0.7.1

- feat(botruntime): fork the `@botpress/runtime` dependency closure (zero-botpress cascade) (6495425)
- feat(runtime): remove legacy cognitive and config fallbacks (#90)
- fix release train closure and mask secret prompts (#95)
