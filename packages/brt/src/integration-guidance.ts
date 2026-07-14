type RegistrationState = {
  webhookId: string
  status: string
  registered: boolean
}

export function pendingIntegrationRegistrationCommands(installations: RegistrationState[]): string[] {
  return installations
    .filter(({ webhookId, status, registered }) => webhookId && !registered && status !== 'registered')
    .map(({ webhookId }) => `brt integrations register ${webhookId}`)
}
