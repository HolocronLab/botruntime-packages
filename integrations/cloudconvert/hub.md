# CloudConvert

Глобальная action-only интеграция `botruntime/cloudconvert@0.1.0` конвертирует
DOCX в PDF через официальный CloudConvert API v2. Она не рендерит шаблоны, не
склеивает PDF и не хранит результат в файловом сторе бота.

## Настройка

| Поле | Тип | Назначение |
| --- | --- | --- |
| `apiKey` | string, secret | API key CloudConvert с минимальными scopes `task.read` и `task.write`. |

API key передаётся только `api.cloudconvert.com` и
`sync.api.cloudconvert.com`. При регистрации интеграция выполняет read-only
проверку `GET /v2/jobs?per_page=1`; отсутствующий или неподходящий key
отклоняется fail loud.

## Action `convertToPdf`

```ts
const { output } = await client.callAction({
  type: 'cloudconvert:convertToPdf',
  input: {
    fileUrl,
    sha256: expectedSha256,
    sourceFormat: 'docx',
  },
})
```

`fileUrl` должен быть HTTPS-ссылкой вида `/v1/files/download?key=...` на
известном runtime origin. Интеграция сама добавляет runtime bearer и `x-bot-id`
только для этого endpoint. При переходе на cross-origin presigned redirect
учётные данные снимаются. Допускается не более трёх редиректов; скачивание
ограничено 15 секундами и 25 МБ.

Перед отправкой провайдеру интеграция сверяет SHA-256 и проверяет ZIP central
directory DOCX, обязательные OOXML parts и отсутствие VBA payload. Runtime URL,
его query и credentials не передаются CloudConvert: проверенные байты идут через
официальный `import/upload`, затем выполняются `convert` (`docx` → `pdf`, engine
`office`) и `export/url`.

Ответ содержит:

- `pdfBase64` — проверенный PDF до 50 МБ;
- `pageCount` — проверенное число страниц, больше нуля;
- `sourceSha256` — фактический SHA-256 скачанных байтов;
- `engine` — фактические engine/version из task, например
  `cloudconvert/office/2021.4`.

Upload и export URL принимаются только на официальных хостах CloudConvert.
API key никогда не отправляется на upload/storage hosts. После скачивания PDF
интеграция вызывает `DELETE /v2/jobs/{id}`; если немедленная очистка не удалась,
action падает. CloudConvert дополнительно удаляет завершённые jobs и временные
файлы автоматически через 24 часа.

## Типизированные ошибки

| Код | Условие |
| --- | --- |
| `fetch_failed` | HTTPS download, runtime credentials, HTTP-статус, сеть или редиректы. |
| `source_mismatch` | Фактический SHA-256 не совпал с ожидаемым. |
| `source_too_large` | DOCX больше 25 МБ. |
| `unsupported_format` | Не `docx`, невалидный OOXML/VBA или CloudConvert не смог открыть документ. |
| `conversion_failed` | API key/scopes, rate limit, provider job, схема ответа, PDF или очистка некорректны. Provider response bodies наружу не возвращаются. |
| `timeout` | Общий дедлайн 60 секунд либо provider HTTP/task timeout. |

Доменный код доступен как `error.metadata.code` и одновременно стоит в
стабильном префиксе message, например `[source_mismatch] ...`.

## Качество, воспроизводимость и наблюдаемость

Интеграция явно выбирает CloudConvert `office` engine для высокой точности
Office → PDF и пишет фактические engine/version в результат. CloudConvert может
обновлять версию движка и PDF-метаданные, поэтому бинарный SHA результата не
считается стабильным. Для аудита храните `sourceSha256`, `engine`, число страниц
и версию сформированного документа.

На каждый вызов пишется одна JSON-строка `cloudconvert.convert` с SHA исходника,
размерами, страницами, длительностью, движком и result code. OpenTelemetry:

- counter `cloudconvert.calls`, attribute `result`;
- histogram `cloudconvert.duration` в миллисекундах, attribute `result`.

Интеграция не сериализует вызовы и допускает минимум четыре параллельные
конвертации в одном runtime process; фактическая пропускная способность зависит
от лимитов аккаунта CloudConvert.

## Приёмочный тест

Тест конвертирует эталонные `claim.docx` и `poa_template.docx`, проверяет число
страниц, кириллические якоря и изображения. Он включается только при наличии
отдельного provider key и checkout репозитория агентов:

```bash
CLOUDCONVERT_ACCEPTANCE_API_KEY=... \
CLOUDCONVERT_ACCEPTANCE_AGENTS_REPO=/path/to/HolocronLab/agents \
CLOUDCONVERT_ACCEPTANCE_AGENTS_REF=main \
bun test test/acceptance.test.ts
```
