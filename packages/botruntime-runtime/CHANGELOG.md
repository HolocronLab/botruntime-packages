# @holocronlab/botruntime-runtime

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-runtime`.

Lightweight runtime library for `brt`-built botruntime agents: conversation, workflow, table and
knowledge-base primitives used both to describe an agent and at run time. See README.md.

## 2.5.4 (current) — 2026-07-23

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.48.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.4
- Обновлены внутренние зависимости: @holocronlab/botruntime-evals@2.1.25
- Обновлены внутренние зависимости: @holocronlab/botruntime-llmz@0.1.5
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.16.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-zai@2.8.8

## 2.5.3 — 2026-07-23

- Wait through the complete integration host lifecycle and advertise a bounded, relative action-response budget derived from the effective transport and current runtime invocation deadlines. Replay action calls only when Cloud explicitly reports that execution was not started and is retryable; workflow steps now stop on non-retryable or outcome-unknown integration execution failures.

## 2.5.2 — 2026-07-22

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.47.1
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.2
- Обновлены внутренние зависимости: @holocronlab/botruntime-evals@2.1.23
- Обновлены внутренние зависимости: @holocronlab/botruntime-llmz@0.1.3
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.15.1
- Обновлены внутренние зависимости: @holocronlab/botruntime-zai@2.8.6

## 2.5.1 — 2026-07-22

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.47.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.1
- Обновлены внутренние зависимости: @holocronlab/botruntime-evals@2.1.22
- Обновлены внутренние зависимости: @holocronlab/botruntime-llmz@0.1.2
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.15.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-zai@2.8.5

## 2.5.0 — 2026-07-22

- Added typed `maxExecutionTime` configuration for classic bot definitions and
ADK agents. `brt dev` and `brt deploy --adk` now carry the configured
per-invocation deadline to the platform instead of silently dropping it.

## 2.4.2 — 2026-07-21

- Обновлены внутренние зависимости: @holocronlab/botruntime-evals@2.1.21
- Обновлены внутренние зависимости: @holocronlab/botruntime-llmz@0.1.1
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.13.8
- Обновлены внутренние зависимости: @holocronlab/botruntime-zai@2.8.4
- Обновлены внутренние зависимости: @holocronlab/botruntime-zui@2.3.1

## 2.4.1 — 2026-07-21

- `Chat.addMessage` now upserts by message id instead of silently no-op'ing on a
repeat id: if the redelivered message's content or attachments differ from what
is already in the transcript, the existing entry is replaced in place (position
preserved) rather than left on its first, partial version. This unblocks the
platform's trailing-edge redelivery of a scheduled message (e.g. a Telegram
album `bloc` whose payload grows between deliveries) — without it, the agent
would keep seeing the first, incomplete album. Identical redeliveries (same
content and attachments) remain a no-op, preserving prior dedup behavior.

## 2.4.0 — 2026-07-20

- Forward incoming PDF files to multimodal models through the existing URL and MIME-type contract, including PDFs inside bloc messages. Images remain native, while unsupported files such as DOCX stay available only as structured message metadata.

## 2.3.0 — 2026-07-20

- `generateContent` пробрасывает `conversationId` в тело cognitive-запроса
(`InputProps`/`CognitiveRequest`), а `InstrumentedCognitive` инжектит активный
conversationId из runtime-контекста (явно переданный выигрывает; спан и запрос
получают один и тот же id). Гейтвей (cloudapi) строит из него `session_id`
sticky-роутинга провайдер-кэша промпта — без поля кэш-стикинес не активируется.
Для потребителей поле опционально, поведение без него не меняется.

## 2.2.14 — 2026-07-20

- Keep hosted-eval terminal polling alive across bounded transient read failures, return the linked terminal EvalRun when Cloud has already finalized it, and stop requesting unsupported Files expiry for runtime-owned state and Telegram image swaps.

## 2.2.13 — 2026-07-19

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.46.7
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.7.2
- Обновлены внутренние зависимости: @holocronlab/botruntime-evals@2.1.19
- Обновлены внутренние зависимости: @holocronlab/botruntime-llmz@0.0.88
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.13.7
- Обновлены внутренние зависимости: @holocronlab/botruntime-zai@2.8.2

## 2.2.12 — 2026-07-19

- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.13.6

## 2.2.11 — 2026-07-18

- `chat.clearTranscript()` now checkpoints a stable Cloud message cursor together with the cleared LLM transcript. Long-lived channel history can no longer be re-imported after a reset when an integration refreshes conversation tags; generated bot definitions include the backward-compatible cursor field.

## 2.2.9

- fix(runtime): fence tracked state snapshots (#102)
- fix(evals): preserve nested checkpoint yields (#103)
- fix(brt): manage production integrations with workspace PAT (#104)
