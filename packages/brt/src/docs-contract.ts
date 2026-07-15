import type { DefinitionTree } from './command-tree'

type ContractDocument = 'overview' | 'reference'

type CommandInventoryEntry = {
  path: string
  aliases: string[]
  options: string[]
}

type DocsRequirement = {
  id: string
  assertion: string
  documents: ContractDocument[]
}

type DocsWorkflow = {
  id: string
  documents: ContractDocument[]
  commandPaths: string[]
}

export type BrtDocsContract = {
  schemaVersion: 1
  package: '@holocronlab/brt'
  source: 'packages/brt/src/command-definitions.ts'
  commands: CommandInventoryEntry[]
  documentation: {
    overviewCommandPaths: string[]
    criticalOptions: Record<string, string[]>
    criticalUsages: Record<string, string[]>
    requirements: DocsRequirement[]
    workflows: DocsWorkflow[]
  }
}

const documentation: BrtDocsContract['documentation'] = {
  overviewCommandPaths: [
    'chat',
    'deploy',
    'dev',
    'integrations install',
    'integrations register',
    'link',
    'login',
    'logs',
    'traces',
    'conversations list',
    'conversations show',
    'eval',
    'eval run',
    'eval runs',
    'profiles active',
    'profiles use',
    'secret set',
  ],
  criticalOptions: {
    chat: ['chatApiUrl', 'protocol'],
    deploy: ['adk', 'allowDestructiveTableChanges', 'noBuild', 'watch'],
    dev: ['check', 'json', 'port', 'watch'],
    'integrations install': ['alias', 'configFile', 'configStdin', 'dev'],
    'integrations publish': ['apiUrl', 'configSchemaFile', 'name', 'noBuild', 'noBundle', 'versionNumber'],
    'integrations register': ['dev'],
    link: ['apiUrl', 'botId', 'keyStdin', 'workspaceId'],
    login: ['apiUrl', 'device', 'token', 'workspaceId'],
    logs: ['botId', 'conversationId', 'follow', 'limit'],
    traces: [
      'action',
      'conversationId',
      'dev',
      'error',
      'limit',
      'name',
      'nextToken',
      'since',
      'source',
      'status',
      'traceId',
      'until',
      'workflow',
    ],
    'conversations list': ['dev', 'limit', 'nextToken', 'since'],
    'conversations show': ['dev'],
    eval: ['dev', 'judgeModel', 'maxConcurrency', 'minPassRate', 'repeat', 'tag', 'timeout', 'type'],
    'eval run': ['dev', 'judgeModel', 'maxConcurrency', 'minPassRate', 'repeat', 'tag', 'timeout', 'type'],
    'eval runs': ['dev', 'latest', 'limit', 'nextToken', 'status', 'verbose'],
    'config set': ['dev', 'valueFile'],
    'secret set': ['dev', 'valueFile'],
  },
  criticalUsages: {
    'integrations install': ['<name@version>'],
    traces: ['[tokens..]'],
    'conversations list': ['[tokens..]'],
    'conversations show': ['<conversationId>'],
    eval: ['[name]'],
    'eval run': ['[name]'],
    'eval runs': ['[runId]'],
  },
  requirements: [
    {
      id: 'single-cli',
      assertion: 'brt is the only developer executable; botruntime-adk is a library used by brt',
      documents: ['overview'],
    },
    {
      id: 'dev-production-isolation',
      assertion: 'brt dev targets an isolated dev bot; production changes require explicit brt deploy --adk',
      documents: ['overview', 'reference'],
    },
    {
      id: 'cloud-authoritative-dependencies',
      assertion: 'brt dev and brt deploy --adk reconcile dependencies with the authoritative selected Cloud target',
      documents: ['overview', 'reference'],
    },
    {
      id: 'cloud-only-endpoint',
      assertion: 'brt uses the botruntime cloud endpoint by default; optional URL overrides are for proxies and platform development, not a self-hosted product',
      documents: ['overview', 'reference'],
    },
    {
      id: 'explicit-integration-version',
      assertion:
        'brt integrations install requires canonical exact SemVer in name@version or namespace/name@version form',
      documents: ['overview', 'reference'],
    },
    {
      id: 'safe-secret-input',
      assertion: 'config, secret, and integration values use stdin or files instead of value argv',
      documents: ['overview', 'reference'],
    },
  ],
  workflows: [
    { id: 'profile-authentication', documents: ['overview', 'reference'], commandPaths: ['login'] },
    { id: 'agent-development', documents: ['overview', 'reference'], commandPaths: ['dev'] },
    { id: 'agent-production', documents: ['overview', 'reference'], commandPaths: ['deploy'] },
    {
      id: 'integration-lifecycle',
      documents: ['overview', 'reference'],
      commandPaths: ['integrations install', 'integrations register'],
    },
    { id: 'target-repair', documents: ['overview', 'reference'], commandPaths: ['link'] },
    {
      id: 'bot-configuration',
      documents: ['reference'],
      commandPaths: ['config set', 'config list', 'config rm', 'secret set'],
    },
    { id: 'trace-diagnostics', documents: ['overview', 'reference'], commandPaths: ['traces'] },
    {
      id: 'conversation-diagnostics',
      documents: ['overview', 'reference'],
      commandPaths: ['conversations list', 'conversations show'],
    },
    {
      id: 'hosted-evals',
      documents: ['overview', 'reference'],
      commandPaths: ['eval', 'eval run', 'eval runs'],
    },
  ],
}

const exactIntegrationRefDescription =
  'Integration reference in name@version or namespace/name@version form; version is required and must be an exact SemVer (for example telegram@1.1.3 or botruntime/yookassa@0.1.0)'

const aliasesOf = (alias: string | string[] | undefined): string[] => {
  if (!alias) return []
  return (Array.isArray(alias) ? alias : [alias]).toSorted()
}

const commandInventory = (tree: DefinitionTree): CommandInventoryEntry[] => {
  const commands: CommandInventoryEntry[] = []

  const visit = (current: DefinitionTree, prefix: string[]) => {
    for (const [name, node] of Object.entries(current)) {
      const path = [...prefix, name]
      if ('subcommands' in node) {
        if (node.default) {
          commands.push({
            path: path.join(' '),
            aliases: aliasesOf(node.default.alias),
            options: Object.entries(node.default.schema)
              .filter(([, option]) => !('hidden' in option && option.hidden === true))
              .map(([name]) => name)
              .toSorted(),
          })
        }
        visit(node.subcommands, path)
        continue
      }

      commands.push({
        path: path.join(' '),
        aliases: aliasesOf(node.alias),
        options: Object.entries(node.schema)
          .filter(([, option]) => !('hidden' in option && option.hidden === true))
          .map(([name]) => name)
          .toSorted(),
      })
    }
  }

  visit(tree, [])
  return commands.toSorted((left, right) => left.path.localeCompare(right.path))
}

const assertKnownCommand = (inventory: Map<string, CommandInventoryEntry>, path: string, owner: string) => {
  if (!inventory.has(path)) {
    throw new Error(`${owner} references unknown brt command: ${path}`)
  }
}

export const validateDocsCriticalRequirements = (tree: DefinitionTree): void => {
  const commands = commandInventory(tree)
  const inventory = new Map(commands.map((command) => [command.path, command]))

  if (inventory.size !== commands.length) {
    throw new Error('brt command tree contains duplicate leaf paths')
  }

  for (const path of documentation.overviewCommandPaths) {
    assertKnownCommand(inventory, path, 'overviewCommandPaths')
  }

  for (const [path, options] of Object.entries(documentation.criticalOptions)) {
    assertKnownCommand(inventory, path, 'criticalOptions')
    const command = inventory.get(path)!
    for (const option of options) {
      if (!command.options.includes(option)) {
        throw new Error(`criticalOptions references unknown option ${path}.${option}`)
      }
    }
  }

  for (const path of Object.keys(documentation.criticalUsages)) {
    assertKnownCommand(inventory, path, 'criticalUsages')
  }

  const integrations = tree.integrations
  const install = integrations && 'subcommands' in integrations ? integrations.subcommands.install : undefined
  const ref = install && 'schema' in install ? install.schema.ref : undefined
  if (
    !ref ||
    ref.positional !== true ||
    ref.demandOption !== true ||
    ref.idx !== 0 ||
    ref.description !== exactIntegrationRefDescription
  ) {
    throw new Error(
      'explicit-integration-version requires integrations install ref to be the required first positional ' +
        'with the exact name@version or namespace/name@version SemVer schema description'
    )
  }

  const requirementIds = new Set<string>()
  for (const requirement of documentation.requirements) {
    if (requirementIds.has(requirement.id)) {
      throw new Error(`duplicate documentation requirement id: ${requirement.id}`)
    }
    requirementIds.add(requirement.id)
  }

  const workflowIds = new Set<string>()
  for (const workflow of documentation.workflows) {
    if (workflowIds.has(workflow.id)) {
      throw new Error(`duplicate documentation workflow id: ${workflow.id}`)
    }
    workflowIds.add(workflow.id)
    for (const path of workflow.commandPaths) {
      assertKnownCommand(inventory, path, `workflow ${workflow.id}`)
    }
  }
}

export const buildBrtDocsContract = (tree: DefinitionTree): BrtDocsContract => {
  validateDocsCriticalRequirements(tree)
  return {
    schemaVersion: 1,
    package: '@holocronlab/brt',
    source: 'packages/brt/src/command-definitions.ts',
    commands: commandInventory(tree),
    documentation,
  }
}

export const serializeBrtDocsContract = (contract: BrtDocsContract): string => `${JSON.stringify(contract, null, 2)}\n`
