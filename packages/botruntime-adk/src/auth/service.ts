import { Client } from '@holocronlab/botruntime-client'
import { AdkError } from '@holocronlab/botruntime-analytics'

export interface AuthResult {
  workspaceId?: string
  workspaceName?: string
  botId?: string
  userId?: string
  email?: string
  displayName?: string
  accountId?: string
  createdAt?: string
}

export class AuthService {
  private apiUrl: string

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl || 'https://api.botpress.cloud'
  }

  async validateToken(token: string): Promise<AuthResult> {
    if (!token || !token.startsWith('bp_')) {
      throw new AdkError({
        code: 'INVALID_TOKEN_FORMAT',
        message: 'Invalid token format. Token should start with "bp_"',
        expected: true,
      })
    }

    try {
      // Create a Botpress client with the token
      const client = new Client({
        apiUrl: this.apiUrl,
        token,
        headers: {
          'x-multiple-integrations': 'true',
        },
      })

      // Try to get account details to validate the token
      // This is a lightweight call that will fail if the token is invalid
      const accountResponse = await client.getAccount({})
      const { account } = accountResponse

      // Also get workspaces for additional context
      const workspaces = await client.list.workspaces({}).collect()

      // If we get here, the token is valid
      return {
        workspaceId: workspaces[0]?.id,
        workspaceName: workspaces[0]?.name,
        accountId: account.id,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
      }
    } catch (error) {
      if (error instanceof Error) {
        // Check for common authentication errors
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          throw new AdkError({
            code: 'AUTH_FAILED',
            message: 'Invalid token. Please check your API token and try again.',
            expected: true,
            cause: error,
          })
        }
        if (error.message.includes('Network') || error.message.includes('ENOTFOUND')) {
          throw new AdkError({
            code: 'NETWORK_ERROR',
            message: `Unable to connect to ${this.apiUrl}. Please check your internet connection and API URL.`,
            expected: true,
            cause: error,
          })
        }
      }

      // Re-throw the original error if it's not a known authentication error
      throw error
    }
  }

  async testConnection(token: string): Promise<boolean> {
    try {
      await this.validateToken(token)
      return true
    } catch {
      return false
    }
  }
}
