# Яндекс.Диск

Файловая интеграция для botruntime: хранит документы дел (сканы ДДУ, сгенерированные
docx — претензии/иски) на Яндекс.Диске и возвращает ссылки. Продуктовое правило H2:
Диск — единственный источник правды для файлов, всё остальное держит только ссылки.

Запускается на нашем runtime-host по той же модели, что telegram/megaplan (форк
`@holocronlab/botruntime-sdk`, drop-in замена Botpress `@botpress/sdk`). Интеграция
предоставляет только **actions** — входящих вебхуков нет.

## Конфигурация (per-install)

| Поле          | Тип            | Назначение |
| ------------- | -------------- | ---------- |
| `yadiskToken` | string, secret | OAuth-токен Яндекс.Диска (scope `cloud_api:disk.app_folder`). Хранится зашифрованным. |
| `yadiskFolder`| string (def "")| Корневой сегмент под `app:/` (напр. `cases`). Пусто = корень папки приложения. |

Токен лежит в `configuration` как `.secret()`, а **не** в build-time `secrets`-блоке:
у Я.Диска нет общего вендорского OAuth-приложения, токен у каждой фирмы свой, и
рантайм доставляет его per-install через заголовок `x-bp-configuration` →
`ctx.configuration`. Это сознательное отступление от generic-шаблона (где токен
вендора кладут в `secrets`).

Токен имеет scope `app_folder`: все пути физически уходят в `/Приложения/<app>/...`,
корень Диска этим токеном недоступен (403). Расширение scope до полного Диска
поменяет построение путей у вызывающего бота, не контракт интеграции.

## Actions

- `createCaseFolder({ path })` → `{ diskPath }` — идемпотентно создаёт папку дела и
  предков. Существующая папка (409) — не ошибка.
- `uploadDocument({ path, fileRef, mimeType?, overwrite? })` →
  `{ diskPath, size, checksum }` — capability `botruntime.durableOperation=v1`.
  Бот запускает его через `startIntegrationOperation`; обычный `callAction`
  отклоняется. CloudAPI закрепляет полный immutable
  `fileRef{id,size,contentType,filename,checksum}`, а интеграция потоково читает
  exact generation без base64 и делает ровно один provider PUT.
- `getLink({ path })` → `{ publicUrl, diskPath }` — публикует ресурс и возвращает
  публичную ссылку (`https://yadi.sk/d/...`) и web deep-link в Диск фирмы
  (`disk:/Приложения/...`). Если после публикации ссылка не появилась, action
  завершается ошибкой.

Base64-download в 0.3.0 удалён: крупные бинарные payload не должны проходить
через JSON action envelope. Для повторной отправки используйте ссылку или
файловый streaming API платформы. Версия 0.2.3 остаётся отдельной неизменяемой
версией для старых установок.

`path` во всех действиях — case-относительный (напр. `lead-1/case-2/ddu/doc.jpg`);
префикс `app:/<yadiskFolder>/` навешивает сама интеграция. Абсолютные `app:/`,
`disk:/` и сегменты `.`/`..` запрещены.

Старт из бота передаёт только scoped file key; CloudAPI канонизирует его до
полного поколения перед durable persistence:

```ts
const operation = await client.startIntegrationOperation({
  type: 'yadisk:uploadDocument',
  idempotencyKey: `claim-document:${documentId}`,
  timeoutSeconds: 3600,
  input: {
    path: `claims/${documentId}.pdf`,
    fileRef: { id: platformFileId },
  },
})
```

Далее вызывающий код опрашивает `getIntegrationOperation`. Только
`status: "succeeded"` разрешает сохранять `result.diskPath`; при
`outcome_unknown` операция остаётся на reconciliation/operator path и не
запускается повторно с новым ключом автоматически.

## Инварианты (порт из TS+Go клиентов)

- Авторизация — заголовок `OAuth <token>`, НЕ Bearer.
- До provider handoff можно повторить получение upload href. После начала
  единственного PUT автоматического повтора нет: timeout/disconnect остаётся
  `outcome_unknown`.
- `reconcile` и `cancel` не повторяют запись. Они читают метаданные Яндекс.Диска
  и признают успех только при точном совпадении `size+sha256`; иначе сохраняют
  `still_unknown`.
- На хост-сторадж по подписанному href OAuth-токен НЕ уходит. Короткие control
  calls имеют bounded timeout; потоковый PUT ограничен business deadline
  durable operation и может работать несколько минут.
- В 0.3.1 runtime-host передаёт cooperative-cancellation через
  `IntegrationLambdaContext.abortSignal`. Интеграция объединяет этот сигнал с
  business deadline и передаёт один `AbortSignal` в FileRef download, provider
  control calls и PUT. До начала PUT остановка остаётся `retry_safe`; после
  начала PUT результат остаётся `outcome_unknown` и сверяется без повтора.
- `getLink` публикует и читает ссылку через `stat` (`fields=public_url,path&limit=0`
  — иначе листинг папки `_embedded` пробил бы лимит тела). В TS-доноре `stat` не
  было — портирован из Go, без него ссылку не прочитать.

## Версия

0.3.1 требует runtime с native durable operation v1, exact FileRef endpoint и
cooperative operation cancellation, а также SDK с
`IntegrationLambdaContext.abortSignal`. Обновление устанавливается как новая
integration version; существующие инсталляции 0.2.3 и 0.3.0 не переназначаются
автоматически.
