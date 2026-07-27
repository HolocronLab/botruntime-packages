import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clientConstructor: vi.fn(),
  botSpecificClientConstructor: vi.fn(),
  cognitiveConstructor: vi.fn(),
  loggerConstructor: vi.fn(),
  setDefaultContext: vi.fn(),
}))

vi.mock('@holocronlab/botruntime-client', () => ({
  Client: class Client {
    constructor(options: unknown) {
      mocks.clientConstructor(options)
    }
  },
}))
vi.mock('@holocronlab/botruntime-sdk', () => ({
  BotSpecificClient: class BotSpecificClient {
    constructor(client: unknown) {
      mocks.botSpecificClientConstructor(client)
    }
  },
  BotLogger: class BotLogger {
    constructor(options: unknown) {
      mocks.loggerConstructor(options)
    }
  },
}))
vi.mock('@holocronlab/botruntime-cognitive', () => ({
  Cognitive: class Cognitive {
    constructor(options: unknown) {
      mocks.cognitiveConstructor(options)
    }
  },
}))
vi.mock('./agent-registry', () => ({
  agentRegistry: {
    integrations: { integration: true },
    interfaces: { interface: true },
    plugins: { plugin: true },
  },
}))
vi.mock('./autonomous', () => ({
  Autonomous: {
    CitationsManager: class CitationsManager {},
  },
}))
vi.mock('./context/context', () => ({
  context: {
    setDefaultContext: mocks.setDefaultContext,
  },
}))

import { initializeScriptContext } from './script-context'

describe('initializeScriptContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('owns the complete generated script bootstrap behind the runtime facade', () => {
    initializeScriptContext({
      executionId: 'script-execution',
      botId: 'bot-42',
      token: 'token',
      apiUrl: 'https://runtime.example',
      workspaceId: 'workspace-2',
      configuration: { feature: true },
    })

    expect(mocks.clientConstructor).toHaveBeenCalledWith({
      token: 'token',
      apiUrl: 'https://runtime.example',
      workspaceId: 'workspace-2',
      botId: 'bot-42',
    })
    expect(mocks.botSpecificClientConstructor).toHaveBeenCalledOnce()
    expect(mocks.cognitiveConstructor).toHaveBeenCalledOnce()
    expect(mocks.loggerConstructor).toHaveBeenCalledWith({})
    expect(mocks.setDefaultContext).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: 'script-execution',
        executionFinished: false,
        botId: 'bot-42',
        configuration: { feature: true },
        integrations: { integration: true },
        interfaces: { interface: true },
        plugins: { plugin: true },
        states: [],
        tags: [],
      })
    )
    const installedContext = mocks.setDefaultContext.mock.calls[0]?.[0]
    expect(installedContext.citations).toBeInstanceOf(Object)
    expect(installedContext.scheduledHeavyImports).toBeInstanceOf(Set)
  })
})
