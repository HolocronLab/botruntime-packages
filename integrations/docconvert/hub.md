# Конвертация документов

Глобальная action-only интеграция `botruntime/docconvert@0.1.0` конвертирует
DOCX в PDF через выделенный Gotenberg с LibreOffice. Она не рендерит шаблоны,
не склеивает PDF и не хранит результат.

## Настройка

| Поле | Тип | Назначение |
| --- | --- | --- |
| `serviceUrl` | HTTPS URL | Base URL внутреннего Gotenberg/reverse proxy без query и fragment. |
| `authToken` | string, secret, optional | Bearer-токен reverse proxy. Интеграция не включает его в свои логи и не отправляет файловому хранилищу; reverse proxy должен редактировать Authorization в access/error logs. |

Без `serviceUrl` интеграция не устанавливается, поэтому action остаётся
недоступным и не блокирует остальные интеграции бота. При регистрации вызывается
`GET /version`; неподходящий или недоступный сервис отклоняется fail loud.

## Action `convertToPdf`

```ts
const { output } = await client.callAction({
  type: 'docconvert:convertToPdf',
  input: {
    fileUrl,
    sha256: expectedSha256,
    sourceFormat: 'docx',
  },
})
```

`fileUrl` должен быть HTTPS-ссылкой вида `/v1/files/download?key=...` на
известном runtime origin. Интеграция сама добавляет runtime bearer и `x-bot-id`,
но только для этого endpoint. При переходе на cross-origin presigned redirect
учётные данные снимаются. Допускается не более трёх редиректов; скачивание
ограничено 15 секундами и 25 МБ.

Перед отправкой в движок интеграция сверяет SHA-256 и проверяет ZIP central
directory DOCX, обязательные OOXML parts и отсутствие VBA payload. Байты
отправляются на `POST /forms/libreoffice/convert`, а не через `downloadFrom`,
поэтому Gotenberg не получает URL или credentials файлового хранилища.

Ответ содержит:

- `pdfBase64` — PDF до 50 МБ;
- `pageCount` — проверенное число страниц, больше нуля;
- `sourceSha256` — фактический SHA-256 скачанных байтов;
- `engine` — версия из `/version`, например `gotenberg/8.34.0+libreoffice`.

Повреждённый PDF, неверный Content-Type, пустой PDF и превышение лимитов никогда
не возвращаются как частичный успех.

## Типизированные ошибки

| Код | Условие |
| --- | --- |
| `fetch_failed` | HTTPS download, credentials, HTTP-статус, сеть или редиректы. |
| `source_mismatch` | Фактический SHA-256 не совпал с ожидаемым. |
| `source_too_large` | DOCX больше 25 МБ. |
| `unsupported_format` | Не `docx`, невалидный OOXML/VBA или отказ Gotenberg 400/415. |
| `conversion_failed` | Движок/версия/ответ/PDF некорректны или PDF больше 50 МБ. Тело ответа движка наружу не возвращается. |
| `timeout` | Общий дедлайн 60 секунд или внутренний timeout Gotenberg. |

SDK резервирует верхнеуровневое поле `code` error-envelope под HTTP-код `400`.
Поэтому доменный код доступен как `error.metadata.code` и одновременно стоит в
стабильном префиксе message, например `[source_mismatch] ...`. Текущий публичный
Botforge action proxy из соображений безопасности удаляет произвольную metadata;
через `/v1/chat/actions` машинно разбирается именно закрытый префикс.

## Движок, шрифты и воспроизводимость

Референсный образ — `converter/Dockerfile` на
`gotenberg/gotenberg:8.34.0-libreoffice`. Образ содержит `fonts-liberation` и
`fonts-liberation2`: Liberation Serif/Sans метрически совместимы с Times New
Roman/Arial и поддерживают кириллицу. Docker build отдельно проверяет наличие
обоих семейств. DOCX с VBA отклоняется до движка; Gotenberg запускает
LibreOffice headless с отключёнными макросами и не загружает linked content из
untrusted office uploads.

Интеграция запрашивает фиксированные `Producer`, `Creator`, `CreationDate` и
`ModDate`. В ручной приёмке образа 8.34.0 Gotenberg применил `Producer`, но
LibreOffice сохранил фактическую `CreationDate`; повторная конвертация одного
DOCX дала разные SHA-256. Поэтому бинарный SHA результата **не считается
стабильным**. Аудит должен хранить `sourceSha256`, `engine`, число страниц и
версию сформированного файла.

Один процесс LibreOffice внутри одного pod Gotenberg сериализует конвертации.
Для четырёх одновременных вызовов `serviceUrl` должен вести на балансировщик как
минимум четырёх Gotenberg replicas. Сам integration runtime не ставит semaphore
и безопасно обслуживает параллельные вызовы.

## Наблюдаемость

На каждый вызов пишется одна JSON-строка `docconvert.convert` с SHA исходника,
размерами, страницами, длительностью, движком и result code. OpenTelemetry:

- counter `docconvert.calls`, attribute `result`;
- histogram `docconvert.duration` в миллисекундах, attribute `result`.

Файлы целиком держатся только в памяти action и не записываются на диск.

## Приёмочный тест

`test/acceptance.test.ts` читает эталонные файлы непосредственно из git-объектов
репозитория агентов и проверяет фактически зафиксированные значения: обе формы
по 2 страницы, кириллические якоря и минимум два изображения в претензии.
В локальной ручной сверке с Gotenberg 8.34.0 у текущей претензии содержимое
занимает первую страницу, а вторая остаётся пустой; у доверенности содержимым
заполнены обе страницы. Перед публикацией эти четыре страницы нужно сопоставить
со скриншотами печати из Word и приложить результат к PR.

```bash
DOCONVERT_ACCEPTANCE_SERVICE_URL=https://convert.staging.internal \
DOCONVERT_ACCEPTANCE_AGENTS_REPO=/path/to/HolocronLab/agents \
DOCONVERT_ACCEPTANCE_AGENTS_REF=main \
bun test test/acceptance.test.ts
```

Для локального контейнера без TLS тест допускает только явный test-only rewrite
`https://127.0.0.1` → `http://127.0.0.1` через
`DOCONVERT_ACCEPTANCE_LOCAL_HTTP=1`; production-конфигурация по-прежнему
принимает исключительно HTTPS.
