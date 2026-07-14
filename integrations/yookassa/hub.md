# ЮKassa

Глобальная интеграция для создания redirect-платежей и безопасного подтверждения оплаты.

## Настройка

- `shopId` — идентификатор магазина.
- `secretKey` — секретный ключ API ЮKassa; хранится как secret конфигурации.

В личном кабинете ЮKassa направьте уведомления `payment.succeeded` на webhook URL
инсталляции. ЮKassa не подписывает уведомление отдельным секретом, поэтому интеграция
не доверяет его телу: она повторно запрашивает платёж через API и создаёт событие только
при `status=succeeded` и `paid=true`.

## Actions

- `createPayment` — создаёт платёж с обязательным caller-owned `idempotenceKey`,
  `metadata.caseId` и redirect confirmation URL.
- `getPayment` — возвращает каноническое состояние платежа из ЮKassa.

## Event

- `paymentSucceeded` — подтверждённое через API событие со стабильным
  `eventId=yookassa:payment.succeeded:<paymentId>` для downstream-дедупликации.
