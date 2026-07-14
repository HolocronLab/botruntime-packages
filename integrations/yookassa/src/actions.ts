import type { IntegrationLogger } from '@holocronlab/botruntime-sdk'
import type { CreatePaymentInput, Payment } from './yookassa-api'
import { YookassaClient } from './yookassa-api'

export type YookassaConfiguration = { shopId: string; secretKey: string }

function clientFromConfig(config: YookassaConfiguration): YookassaClient {
  return new YookassaClient(config)
}

export async function createPayment(
  config: YookassaConfiguration,
  input: CreatePaymentInput,
  logger: IntegrationLogger,
): Promise<ReturnType<typeof paymentOutput>> {
  const payment = await clientFromConfig(config).createPayment(input)
  logger.forBot().info(`ЮKassa: платёж ${payment.id} создан для дела ${input.caseId}`)
  return paymentOutput(payment)
}

export async function getPayment(
  config: YookassaConfiguration,
  paymentId: string,
): Promise<ReturnType<typeof paymentOutput>> {
  return paymentOutput(await clientFromConfig(config).getPayment(paymentId))
}

export function paymentOutput(payment: Payment) {
  return {
    paymentId: payment.id,
    caseId: payment.caseId,
    status: payment.status,
    paid: payment.paid,
    amount: payment.amount,
    confirmationUrl: payment.confirmationUrl,
    capturedAt: payment.capturedAt,
  }
}
