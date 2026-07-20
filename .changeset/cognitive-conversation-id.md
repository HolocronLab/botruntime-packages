---
"@holocronlab/botruntime-cognitive": minor
"@holocronlab/botruntime-runtime": minor
---

`generateContent` пробрасывает `conversationId` в тело cognitive-запроса
(`InputProps`/`CognitiveRequest`), а `InstrumentedCognitive` инжектит активный
conversationId из runtime-контекста (явно переданный выигрывает; спан и запрос
получают один и тот же id). Гейтвей (cloudapi) строит из него `session_id`
sticky-роутинга провайдер-кэша промпта — без поля кэш-стикинес не активируется.
Для потребителей поле опционально, поведение без него не меняется.
