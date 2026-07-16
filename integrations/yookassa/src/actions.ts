import { RuntimeError, type IntegrationLogger } from '@holocronlab/botruntime-sdk'
import type { CreatePaymentInput, Payment } from './yookassa-api'
import { YookassaApiError, YookassaClient } from './yookassa-api'

export type YookassaConfiguration = { shopId: string; secretKey: string }

function clientFromConfig(config: YookassaConfiguration): YookassaClient {
  return new YookassaClient(config)
}

export async function createPayment(
  config: YookassaConfiguration,
  input: CreatePaymentInput,
  logger: IntegrationLogger,
  clientOverride?: Pick<YookassaClient, 'createPayment'>,
): Promise<ReturnType<typeof paymentOutput>> {
  try {
    const payment = await (clientOverride ?? clientFromConfig(config)).createPayment(input)
    logger.forBot().info(`ЮKassa: платёж ${payment.id} создан для дела ${input.caseId}`)
    return paymentOutput(payment)
  } catch (error) {
    logger.forBot().error(actionErrorLog(error))
    if (error instanceof YookassaApiError && error.status > 0) {
      throw new RuntimeError(error.message)
    }
    throw error
  }
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

function actionErrorLog(error: unknown): string {
  if (!(error instanceof YookassaApiError)) return 'ЮKassa: createPayment failed'
  const diagnostics = [
    `HTTP ${error.status || 'network'}`,
    error.code ? `code=${error.code}` : undefined,
    error.parameter ? `parameter=${error.parameter}` : undefined,
  ].filter(Boolean)
  return `ЮKassa: createPayment failed (${diagnostics.join(', ')})`
}
