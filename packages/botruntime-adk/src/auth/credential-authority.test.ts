import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CredentialsManager } from './credentials.js'
import { auth, resolveProjectCredentials, resolveWorkspaceCredentials } from './index.js'

describe('credential authority', () => {
  const temporaryRoots: string[] = []

  afterEach(() => {
    vi.restoreAllMocks()
    for (const root of temporaryRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('treats complete provided credentials as sole API/workspace authority', async () => {
    const provided = { token: 'selected_pat', apiUrl: 'https://selected.example/', workspaceId: 'selected_ws' }

    await expect(
      resolveProjectCredentials({
        project: {
          agentInfo: {
            botId: 'poison_bot',
            apiUrl: 'https://poison.invalid',
            workspaceId: 'poison_ws',
          },
        },
        credentials: provided,
      })
    ).resolves.toEqual(provided)
  })

  it('rejects partial provided credentials instead of borrowing poisoned project coordinates', async () => {
    await expect(
      resolveWorkspaceCredentials({
        project: {
          agentInfo: {
            botId: 'poison_bot',
            apiUrl: 'https://poison.invalid',
            workspaceId: 'poison_ws',
          },
        },
        credentials: { token: 'partial_pat', apiUrl: 'https://selected.example' },
      })
    ).rejects.toThrow(/workspace|complete|partial/i)
  })

  it.each([
    { field: 'token', credentials: { token: '', apiUrl: 'https://selected.example', workspaceId: 'selected_ws' } },
    { field: 'apiUrl', credentials: { token: 'pat', apiUrl: '', workspaceId: 'selected_ws' } },
    { field: 'workspaceId', credentials: { token: 'pat', apiUrl: 'https://selected.example', workspaceId: '' } },
    { field: 'malformed token', credentials: { token: null, apiUrl: 'https://selected.example', workspaceId: 'ws' } },
  ])('rejects incomplete $field credentials with an actionable authority error', async ({ credentials }) => {
    await expect(resolveWorkspaceCredentials({ credentials: credentials as any })).rejects.toThrow(
      /non-empty|partial|credentials/i
    )
  })

  it('rejects explicit coordinate overrides that disagree with provided credentials', async () => {
    await expect(
      resolveWorkspaceCredentials({
        credentials: { token: 'selected_pat', apiUrl: 'https://selected.example', workspaceId: 'selected_ws' },
        apiUrl: 'https://poison.invalid',
        workspaceId: 'poison_ws',
      })
    ).rejects.toThrow(/match|authority|credentials/i)
  })

  it('requires an exact profile for explicit coordinates when credentials are omitted', async () => {
    const lookup = vi.spyOn(auth, 'getAuthorityCredentials').mockRejectedValue(new Error('no exact authority'))

    await expect(
      resolveWorkspaceCredentials({ apiUrl: 'https://poison.invalid', workspaceId: 'poison_ws' })
    ).rejects.toThrow(/exact authority/)
    expect(lookup).toHaveBeenCalledWith('https://poison.invalid', 'poison_ws')
  })

  it('rejects explicit coordinates that disagree with project authority before inheriting its bot', async () => {
    const lookup = vi.spyOn(auth, 'getAuthorityCredentials')

    await expect(
      resolveWorkspaceCredentials({
        apiUrl: 'https://selected.example',
        workspaceId: 'selected_ws',
        project: {
          agentInfo: { botId: 'poison_bot', apiUrl: 'https://poison.invalid', workspaceId: 'poison_ws' },
        },
      })
    ).rejects.toThrow(/project authority|does not match/i)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('requires an exact profile for materialized project authority even without a path', async () => {
    const lookup = vi.spyOn(auth, 'getAuthorityCredentials').mockRejectedValue(new Error('no exact authority'))

    await expect(
      resolveWorkspaceCredentials({
        project: {
          agentInfo: { botId: 'poison_bot', apiUrl: 'https://poison.invalid', workspaceId: 'poison_ws' },
        },
      })
    ).rejects.toThrow(/exact authority/)
    expect(lookup).toHaveBeenCalledWith('https://poison.invalid', 'poison_ws')
  })

  it('rejects an empty project workspace before falling back to the active PAT', async () => {
    const active = vi.spyOn(auth, 'getActiveCredentials').mockResolvedValue({
      token: 'active_pat',
      apiUrl: 'https://active.example',
      workspaceId: 'active_ws',
    })

    await expect(
      resolveWorkspaceCredentials({
        project: {
          agentInfo: { botId: 'poison_bot', apiUrl: 'https://poison.invalid', workspaceId: '' },
        },
      })
    ).rejects.toThrow(/non-empty|incomplete|workspace/i)
    expect(active).not.toHaveBeenCalled()
  })

  const createManager = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-credential-authority-'))
    temporaryRoots.push(root)
    const manager = new CredentialsManager()
    ;(manager as any).configDir = path.join(root, '.adk')
    ;(manager as any).credentialsPath = path.join(root, '.adk', 'credentials')
    const agentPath = path.join(root, 'agent')
    fs.mkdirSync(agentPath, { recursive: true })
    return { manager, agentPath }
  }

  it('does not fall back to the active PAT when no profile matches agent API and workspace', async () => {
    const { manager, agentPath } = createManager()
    await manager.saveCredentials('active', {
      token: 'active_pat',
      apiUrl: 'https://active.example',
      workspaceId: 'active_ws',
    })
    fs.writeFileSync(
      path.join(agentPath, 'agent.json'),
      JSON.stringify({ botId: 'target_bot', apiUrl: 'https://target.example', workspaceId: 'target_ws' })
    )

    await expect(manager.getAgentCredentials(agentPath)).rejects.toThrow(/matching profile|authority|workspace/i)
  })

  it('selects a profile only when both normalized API URL and workspace match', async () => {
    const { manager, agentPath } = createManager()
    await manager.saveCredentials('same-host-wrong-workspace', {
      token: 'wrong_pat',
      apiUrl: 'https://target.example',
      workspaceId: 'wrong_ws',
    })
    await manager.saveCredentials('exact', {
      token: 'exact_pat',
      apiUrl: 'https://target.example/',
      workspaceId: 'target_ws',
    })
    fs.writeFileSync(
      path.join(agentPath, 'agent.json'),
      JSON.stringify({ botId: 'target_bot', apiUrl: 'https://target.example', workspaceId: 'target_ws' })
    )

    await expect(manager.getAgentCredentials(agentPath)).resolves.toMatchObject({
      token: 'exact_pat',
      apiUrl: 'https://target.example',
      workspaceId: 'target_ws',
      botId: 'target_bot',
    })
  })

  it('rejects an explicitly selected profile whose authority disagrees with the agent', async () => {
    const { manager, agentPath } = createManager()
    await manager.saveCredentials('wrong', {
      token: 'wrong_pat',
      apiUrl: 'https://wrong.example',
      workspaceId: 'wrong_ws',
    })
    await manager.saveCredentials('exact', {
      token: 'exact_pat',
      apiUrl: 'https://target.example',
      workspaceId: 'target_ws',
    })
    manager.setProfileOverride('wrong')
    fs.writeFileSync(
      path.join(agentPath, 'agent.json'),
      JSON.stringify({ botId: 'target_bot', apiUrl: 'https://target.example', workspaceId: 'target_ws' })
    )

    await expect(manager.getAgentCredentials(agentPath)).rejects.toThrow(/profile|match|authority/i)
  })
})
