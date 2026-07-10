import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@holocronlab/botruntime-runtime', () => ({
  Autonomous: { Tool: class Tool {} },
  defineConfig: <T>(config: T) => config,
}))
vi.mock('@holocronlab/botruntime-runtime/internal', () => ({
  BuiltInActions: {},
  BuiltInWorkflows: {},
  Errors: {},
  Primitives: { Definitions: {} },
  isAgentConfig: () => true,
  setAdkCommand: vi.fn(),
}))
vi.mock('@holocronlab/botruntime-runtime/definition', () => ({
  BUILT_IN_TAGS: { workflow: {}, user: {}, message: {}, conversation: {} },
}))

import { AgentProject } from './agent-project.js'
import { resolveAgent } from './agent-resolver.js'

const API_URL = 'https://cloud.example'
const WORKSPACE_ID = 'workspace_exact'
const CREDENTIALS = { token: 'token', apiUrl: API_URL, workspaceId: WORKSPACE_ID }

const snapshot = (env: 'dev' | 'prod', alias: string, marker: string, apiUrl = API_URL) => ({
  version: 2,
  env,
  target: { apiUrl, workspaceId: WORKSPACE_ID, botId: `${env}_bot` },
  fetchedAt: '2026-07-09T00:00:00.000Z',
  integrations: {
    [alias]: { name: alias, version: '1.0.0', enabled: true, config: { marker } },
  },
  plugins: {},
})

describe('AgentProject dependency snapshot environment', () => {
  let projectPath: string

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-dependency-env-'))
    fs.writeFileSync(path.join(projectPath, 'agent.config.ts'), 'export default { name: "snapshot-fixture" }')
    fs.writeFileSync(
      path.join(projectPath, 'agent.json'),
      JSON.stringify({ botId: 'prod_bot', workspaceId: WORKSPACE_ID, apiUrl: API_URL })
    )
    fs.writeFileSync(
      path.join(projectPath, 'agent.local.json'),
      JSON.stringify({
        devId: 'dev_opaque',
        devTargetBotId: 'dev_bot',
      })
    )
    const snapshotDir = path.join(projectPath, '.adk', 'dependencies')
    fs.mkdirSync(snapshotDir, { recursive: true })
    fs.writeFileSync(path.join(snapshotDir, 'dev.json'), JSON.stringify(snapshot('dev', 'dev_only', 'DEV_SENTINEL')))
    fs.writeFileSync(path.join(snapshotDir, 'prod.json'), JSON.stringify(snapshot('prod', 'prod_only', 'PROD_SENTINEL')))
    AgentProject.clearCache()
  })

  afterEach(() => {
    AgentProject.clearCache()
    fs.rmSync(projectPath, { recursive: true, force: true })
  })

  it.each([
    {
      adkCommand: 'adk-dev' as const,
      configTarget: {
        environment: 'dev' as const,
        botId: 'dev_bot',
        runtimeBotId: 'dev_opaque',
        credentials: CREDENTIALS,
      },
      expected: 'dev_only',
      rejected: 'prod_only',
    },
    {
      adkCommand: 'adk-build' as const,
      configTarget: { environment: 'prod' as const, botId: 'prod_bot', credentials: CREDENTIALS },
      expected: 'prod_only',
      rejected: 'dev_only',
    },
    {
      adkCommand: 'adk-deploy' as const,
      configTarget: { environment: 'prod' as const, botId: 'prod_bot', credentials: CREDENTIALS },
      expected: 'prod_only',
      rejected: 'dev_only',
    },
  ])('$adkCommand reads only its authoritative snapshot', async ({ adkCommand, configTarget, expected, rejected }) => {
    const project = await AgentProject.load(projectPath, { adkCommand, configTarget, offline: true, noCache: true })

    expect(project.dependencies.integrations).toHaveProperty(expected)
    expect(project.dependencies.integrations).not.toHaveProperty(rejected)
    expect(JSON.stringify(project.dependencies)).toContain(adkCommand === 'adk-dev' ? 'DEV_SENTINEL' : 'PROD_SENTINEL')
    expect(JSON.stringify(project.dependencies)).not.toContain(adkCommand === 'adk-dev' ? 'PROD_SENTINEL' : 'DEV_SENTINEL')
  })

  it('fails closed on a foreign prod snapshot and never falls back to local poison or empty dependencies', async () => {
    fs.writeFileSync(
      path.join(projectPath, 'agent.local.json'),
      JSON.stringify({
        botId: 'local_poison',
        workspaceId: 'local_poison_workspace',
        apiUrl: 'http://local-poison.invalid',
        devId: 'dev_opaque',
        devTargetBotId: 'dev_bot',
      })
    )
    fs.writeFileSync(
      path.join(projectPath, '.adk', 'dependencies', 'prod.json'),
      JSON.stringify(snapshot('prod', 'foreign_only', 'FOREIGN_SENTINEL', 'https://foreign.example'))
    )

    await expect(
      AgentProject.load(projectPath, {
        adkCommand: 'adk-build',
        configTarget: { environment: 'prod', botId: 'prod_bot', credentials: CREDENTIALS },
        offline: true,
        noCache: true,
      })
    ).rejects.toThrow(/snapshot.*target|foreign|authority/i)
  })

  it('preserves both dev identities across shared and local link updates', async () => {
    const project = new AgentProject(projectPath)
    await project.createAgentInfo({
      botId: 'prod_bot',
      workspaceId: 'workspace',
      apiUrl: 'https://cloud.example',
    })
    await project.createAgentLocalInfo({ devId: 'dev_opaque', devTargetBotId: '42' })

    await project.updateAgentInfo({ workspaceId: 'updated_workspace' })
    await project.updateAgentLocalInfo({ devId: 'dev_opaque_updated' })

    expect(project.agentInfo).toMatchObject({
      botId: 'prod_bot',
      workspaceId: 'updated_workspace',
      devId: 'dev_opaque_updated',
      devTargetBotId: '42',
    })
    expect(JSON.parse(fs.readFileSync(path.join(projectPath, 'agent.json'), 'utf8'))).not.toHaveProperty(
      'devTargetBotId'
    )
  })

  it('mirrors the scoped dev quartet schema and JSON key order', async () => {
    const project = new AgentProject(projectPath)
    await project.createAgentLocalInfo({
      botId: 'local_prod',
      workspaceId: 'local_ws',
      apiUrl: 'http://local.example',
      devId: 'shared-runtime',
      devTargetBotId: '42',
      devApiUrl: 'https://cloud.example/',
      devWorkspaceId: 'cloud_ws',
    })

    expect(fs.readFileSync(path.join(projectPath, 'agent.local.json'), 'utf8')).toBe(
      JSON.stringify(
        {
          botId: 'local_prod',
          workspaceId: 'local_ws',
          apiUrl: 'http://local.example',
          devId: 'shared-runtime',
          devTargetBotId: '42',
          devApiUrl: 'https://cloud.example',
          devWorkspaceId: 'cloud_ws',
        },
        null,
        2
      )
    )
    await expect(resolveAgent(projectPath)).resolves.toMatchObject({
      devApiUrl: 'https://cloud.example',
      devWorkspaceId: 'cloud_ws',
    })
  })

  it('uses dedicated dev scope rather than local prod coordinates for ambient snapshot resolution', async () => {
    fs.writeFileSync(
      path.join(projectPath, 'agent.local.json'),
      JSON.stringify({
        botId: 'local_prod',
        workspaceId: 'local_ws',
        apiUrl: 'http://local.example',
        devId: 'dev_opaque',
        devTargetBotId: 'dev_bot',
        devApiUrl: API_URL,
        devWorkspaceId: WORKSPACE_ID,
      })
    )

    const project = await AgentProject.load(projectPath, {
      adkCommand: 'adk-dev',
      offline: true,
      noCache: true,
    })

    expect(project.dependencies.integrations).toHaveProperty('dev_only')
  })

  it('resolves both dev identities from an agent.local-only project', async () => {
    fs.writeFileSync(
      path.join(projectPath, 'agent.local.json'),
      JSON.stringify({
        botId: 'prod_bot',
        workspaceId: 'workspace',
        devId: 'dev_opaque',
        devTargetBotId: '42',
      })
    )

    await expect(resolveAgent(projectPath)).resolves.toMatchObject({
      botId: 'prod_bot',
      workspaceId: 'workspace',
      devId: 'dev_opaque',
      devTargetBotId: '42',
    })
  })
})
