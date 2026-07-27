# Megaplan

Интеграция CRM **Megaplan** (API v3) для платформы botruntime. Любой бот может
вызывать типизированные действия CRM и получать универсальные команды из
сценариев Megaplan. Бизнес-процесс и его состояния остаются кодом бота.

## Настройка

Создайте в Megaplan сервисного пользователя и заполните конфигурацию:

- **Адрес аккаунта** — `https://<account>.megaplan.ru`
- **Логин** / **Пароль** — учётка сервисного пользователя (хранятся как secret)

Авторизация — OAuth2 password grant. Токен живёт ≥180 дней, кэшируется и
перевыпускается только по HTTP 401.

## Действия

- **Поиск контрагентов** — поиск по телефону, имени или email.
- **Создать контрагента (физлицо)** — через `/contractorHuman`.
- **Создать / Получить / Обновить поля сделки**.
- **Сменить этап сделки** — перевод по воронке через `applyTransition`
  (прямая запись статуса API игнорирует); недоступный переход возвращается ошибкой.
- **Список программ / Статусы программы** — разрешение `programId`/`stateId` по имени.
- **Добавить комментарий** — HTML-комментарий к сделке, контрагенту или задаче.
- **Опубликовать документы дела** — durable action `publishCaseDocument`:
  потоково читает упорядоченные immutable `FileRef` из Botruntime Files,
  загружает каждый файл через `POST /api/file` и создаёт одну запись журнала
  с `attaches: [{ contentType: "File", id }]`. Возвращает `commentId` и
  `attachmentIds` в исходном порядке.
- **Чек-лист сделки** — создать / список / завершить пункт.
- **Задачи** — создать задачу сотруднику, безопасно прочитать её текущее
  состояние и менять статус через `doAction`.
- **Задача-согласование** — загрузить материал в Megaplan, создать нативный
  элемент согласования с файлом и SHA-256 и разрешить link-entity
  `actualVersion` по `id` через соответствующую полную запись в `versions[]`,
  где API возвращает статус и визы. Если ссылка есть, но соответствующая полная
  запись отсутствует или неоднозначна, интеграция возвращает ошибку; отсутствие
  самой `actualVersion` означает `pending`.
- **Входящие команды процесса** — проверить универсальный JSON-конверт и
  выпустить integration event `entityCommand`; runtime адресует его боту как
  `megaplan:entityCommand`.

## Входящий webhook

Кнопочный сценарий отправляет POST на hook установленной интеграции с
`Authorization: Bearer <installation webhook secret>`. Контракт не содержит
семантики конкретного бота:

```json
{
  "eventId": "process-42:advance:review",
  "entityType": "deal",
  "entityId": "42",
  "command": "advance",
  "arguments": { "target": "review" },
  "actorId": "7"
}
```

Интеграция валидирует конверт. Допустимые `command` и `arguments` определяет и
повторно валидирует бот, поэтому новый сценарий не требует новой версии
интеграции.

Секрет проверяет runtime-host до запуска кода интеграции. `actorId` — только
аудит и не заменяет авторизацию. Повтор события безопасен только при том же
`eventId`; новое решение должно иметь новый детерминированный ключ.

## Заметки по аккаунту

- Программы (воронки) создаются только в UI Megaplan; ID программ, статусов и
  ответственных сотрудников нужно подтвердить в целевом аккаунте до включения.
- Суммы (`price`) бот передаёт десятичной строкой — не float.
- Лимиты аккаунта: 5 rps / 1000 запросов в час.

## Публикация документов дела

`publishCaseDocument` запускается только через native durable operation.
Обычный `callAction` отклоняется: в JSON-конверте не должно быть байтов,
base64 и внутренних URL Files API.

```ts
import type {
  Integration_Actions_BotruntimeMegaplan,
} from '../../.adk/integrations/botruntime_megaplan/actions'

type PublishInput =
  Integration_Actions_BotruntimeMegaplan['publishCaseDocument']['input']

const input = {
  owner: 'deal',
  ownerId: dealId,
  contentHtml: '<p>Исковое заявление и приложения готовы.</p>',
  attachments: documents.map(({ fileRefId, displayName, mimeType }) => ({
    fileRef: { id: fileRefId },
    displayName,
    mimeType,
  })),
} satisfies PublishInput

const operation = await client.startIntegrationOperation({
  type: 'botruntime/megaplan:publishCaseDocument',
  idempotencyKey: `case-document:${publicationId}`,
  resourceKey: `megaplan:deal:${dealId}:journal`,
  timeoutSeconds: 3600,
  input,
})
```

Инварианты:

- `attachments` содержит 1–16 файлов. Порядок File ID в комментарии и
  `result.attachmentIds` совпадает с порядком входа.
- CloudAPI заменяет каждый `attachments[*].fileRef` на полный авторитетный
  `version + id + generation + checksum + size + contentType + filename` до
  сохранения операции.
- Runtime SDK создаёт файловый и checkpoint-клиенты только при явных
  `capabilities.files = "1"` и `capabilities.checkpoint = "1"`; вход рекурсивно
  не сканируется.
- Интеграция открывает закреплённое поколение через
  `OperationFilesClient.openRef()` и строит
  потоковый multipart внутри provider boundary. Бот не получает URL и не
  касается бинарного потока.
- После начала `POST /api/file` timeout, disconnect, `5xx` и некорректный
  success-ответ означают `outcome_unknown`. Повторная загрузка запрещена.
- Подтверждённые File ID и comment ID сохраняются только в bounded fenced
  checkpoint самой integration operation. HTML, байты, URL и file key туда
  не записываются.
- `reconcile` не делает POST. Он читает checkpoint и ищет детерминированный
  маркер комментария; отсутствие маркера не доказывает, что POST не применился.

Версия `0.2.9` требует backend/runtime-host с nested FileRef admission и
operation-owned fenced checkpoints. Сначала обновляется ядро, затем новая
версия публикуется в каталоге и существующая установка атомарно переводится
командой `brt integrations upgrade botruntime/megaplan@0.2.9`. Одна публикация
не меняет установки, закреплённые на `0.2.8`.
