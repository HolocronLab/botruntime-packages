import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AGENT0_DEFAULT_PROMPT } from './prompts/default.js'
import { GUIDED_SETUP_PROMPT } from './prompts/guided-setup.js'

export interface Agent0OpenCodeMcpConfig {
  type: 'remote'
  url: string
  oauth: false
}

export interface Agent0OpenCodeCommandConfig {
  template: string
  description?: string
  agent?: string
  model?: string
  subtask?: boolean
}

export interface Agent0OpenCodeAgentConfig {
  description?: string
  prompt?: string
  mode?: 'primary' | 'subagent' | 'all'
  hidden?: boolean
  steps?: number
  permission?: Record<string, 'ask' | 'allow' | 'deny' | Record<string, 'ask' | 'allow' | 'deny'>>
}

export interface Agent0BuiltInCapabilityBundle {
  mcp: Record<'adk', Agent0OpenCodeMcpConfig>
  skills: {
    paths: string[]
    urls: []
  }
  instructions: string[]
  command: Record<string, Agent0OpenCodeCommandConfig>
  agent: Record<string, Agent0OpenCodeAgentConfig>
  defaultAgent: string
}

export interface Agent0BuiltInCapabilityOptions {
  adkDevConsolePort: number
  agentPath: string
}

const AGENT0_DEFAULT_AGENT = 'default'
const AGENT0_DEFAULT_PRIMARY_AGENT_STEPS = 64
// Env override for the Agent(0) primary-agent step cap (default 64).
export const AGENT0_PRIMARY_AGENT_STEPS_ENV = 'ADK_AGENT0_MAX_STEPS'

// Invalid (non-integer or <= 0) warns and falls back to the default.
export function resolveAgent0PrimaryAgentSteps(env: Record<string, string | undefined> = process.env): number {
  const raw = env[AGENT0_PRIMARY_AGENT_STEPS_ENV]
  if (raw === undefined || raw.trim() === '') return AGENT0_DEFAULT_PRIMARY_AGENT_STEPS
  const parsed = Number(raw)
  if (Number.isInteger(parsed) && parsed > 0) return parsed
  process.stderr.write(
    `[adk] Ignoring invalid ${AGENT0_PRIMARY_AGENT_STEPS_ENV}=${JSON.stringify(raw)}: ` +
      `expected a positive integer of agentic steps. Falling back to ${AGENT0_DEFAULT_PRIMARY_AGENT_STEPS}.\n`
  )
  return AGENT0_DEFAULT_PRIMARY_AGENT_STEPS
}
export const AGENT0_PROJECT_DIR = '.agent0'
export const AGENT0_PROJECT_CAPABILITIES_DIR = 'capabilities'
export const AGENT0_PROJECT_SKILLS_DIR = 'skills'
export const AGENT0_PROJECT_PLAYBOOKS_DIR = 'playbooks'
export const AGENT0_PROJECT_CAPABILITIES_MANIFEST = 'manifest.json'
export const AGENT0_SCREENSHOT_MCP_TOOL_PERMISSION = 'adk_adk_take_screenshot'
export const AGENT0_SCREENSHOT_RAW_TOOL_PERMISSION = 'adk_take_screenshot'

export function buildAgent0BuiltInCapabilities(options: Agent0BuiltInCapabilityOptions): Agent0BuiltInCapabilityBundle {
  const skillsRoot = resolveAgent0ProjectSkillsRoot(options.agentPath)
  const commandsRoot = resolveAgent0ProjectPlaybooksRoot(options.agentPath)
  const primaryAgentSteps = resolveAgent0PrimaryAgentSteps()
  return {
    mcp: {
      adk: {
        type: 'remote',
        url: `http://localhost:${options.adkDevConsolePort}/mcp?agent=${encodeURIComponent(options.agentPath)}`,
        oauth: false,
      },
    },
    skills: {
      paths: skillsRoot ? resolveAgent0BuiltInSkillPaths(skillsRoot) : [],
      urls: [],
    },
    instructions: skillsRoot ? resolveAgent0BuiltInInstructionFiles(skillsRoot) : [],
    command: commandsRoot ? loadAgent0BuiltInCommandConfig(commandsRoot) : {},
    agent: {
      default: {
        description: 'Agent(0) - helps build and debug Botpress ADK agents',
        prompt: AGENT0_DEFAULT_PROMPT,
        mode: 'primary',
        steps: primaryAgentSteps,
      },
      guided: {
        description: 'ADK guided setup - interviews the developer and scaffolds a new agent',
        prompt: GUIDED_SETUP_PROMPT,
        mode: 'primary',
        steps: primaryAgentSteps,
        permission: {
          // OpenCode permission keys MCP tools as "<server>_<tool>".
          [AGENT0_SCREENSHOT_MCP_TOOL_PERMISSION]: 'deny',
          [AGENT0_SCREENSHOT_RAW_TOOL_PERMISSION]: 'deny',
        },
      },
      build: {
        mode: 'primary',
        steps: primaryAgentSteps,
      },
      plan: {
        mode: 'primary',
        steps: primaryAgentSteps,
      },
    },
    defaultAgent: AGENT0_DEFAULT_AGENT,
  }
}

export function getAgent0ProjectCapabilitiesRoot(projectPath: string): string {
  return join(projectPath, AGENT0_PROJECT_DIR, AGENT0_PROJECT_CAPABILITIES_DIR)
}

export function getAgent0ProjectCapabilitiesManifestPath(projectPath: string): string {
  return join(getAgent0ProjectCapabilitiesRoot(projectPath), AGENT0_PROJECT_CAPABILITIES_MANIFEST)
}

export function resolveAgent0ProjectSkillsRoot(projectPath: string): string | undefined {
  return firstExistingDirectory([join(getAgent0ProjectCapabilitiesRoot(projectPath), AGENT0_PROJECT_SKILLS_DIR)])
}

export function resolveAgent0ProjectPlaybooksRoot(projectPath: string): string | undefined {
  return firstExistingDirectory([join(getAgent0ProjectCapabilitiesRoot(projectPath), AGENT0_PROJECT_PLAYBOOKS_DIR)])
}

export function resolveAgent0BuiltInSkillsRoot(): string | undefined {
  return firstExistingDirectory(resolveAgent0BuiltInSkillsRootCandidates(moduleDir()))
}

export function resolveAgent0BuiltInCommandsRoot(): string | undefined {
  return firstExistingDirectory(resolveAgent0BuiltInCommandsRootCandidates(moduleDir()))
}

export function resolveAgent0BuiltInSkillPaths(skillsRoot = resolveAgent0BuiltInSkillsRoot()): string[] {
  if (!skillsRoot) return []

  return readdirSync(skillsRoot)
    .toSorted()
    .flatMap((entry) => {
      const dir = join(skillsRoot, entry)
      if (!statSync(dir).isDirectory()) return []
      if (!existsSync(join(dir, 'SKILL.md'))) return []
      return [dir]
    })
}

export function resolveAgent0BuiltInInstructionFiles(skillsRoot = resolveAgent0BuiltInSkillsRoot()): string[] {
  const files = skillsRoot ? [join(skillsRoot, 'adk', 'SKILL.md')] : []
  return files.filter((file) => existsSync(file) && statSync(file).isFile())
}

export function loadAgent0BuiltInCommandConfig(
  commandsRoot = resolveAgent0BuiltInCommandsRoot()
): Record<string, Agent0OpenCodeCommandConfig> {
  if (!commandsRoot) return {}

  const commands: Record<string, Agent0OpenCodeCommandConfig> = {}
  for (const file of readdirSync(commandsRoot).toSorted()) {
    if (extname(file) !== '.md') continue

    const filepath = join(commandsRoot, file)
    if (!statSync(filepath).isFile()) continue

    const parsed = parseFrontmatterMarkdown(readFileSync(filepath, 'utf8'))
    const name = parsed.frontmatter.name || basename(file, '.md')
    if (!name) continue

    commands[name] = {
      template: parsed.body.trim(),
      ...(parsed.frontmatter.description ? { description: parsed.frontmatter.description } : {}),
      ...(parsed.frontmatter.agent ? { agent: parsed.frontmatter.agent } : {}),
      ...(parsed.frontmatter.model ? { model: parsed.frontmatter.model } : {}),
      ...(parsed.frontmatter.subtask === 'true'
        ? { subtask: true }
        : parsed.frontmatter.subtask === 'false'
          ? { subtask: false }
          : {}),
    }
  }

  return commands
}

function parseFrontmatterMarkdown(text: string): { frontmatter: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!match) return { frontmatter: {}, body: text }

  const frontmatter: Record<string, string> = {}
  for (const line of match[1]!.split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index === -1) continue

    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    if (!key || !value) continue

    frontmatter[key] = unquote(value)
  }

  return { frontmatter, body: match[2] ?? '' }
}

function unquote(value: string): string {
  const quote = value[0]
  return quote && quote === value[value.length - 1] && (quote === '"' || quote === "'") ? value.slice(1, -1) : value
}

function firstExistingDirectory(paths: string[]): string | undefined {
  return paths.find((dir) => existsSync(dir) && statSync(dir).isDirectory())
}

export function resolveAgent0BuiltInSkillsRootCandidates(baseDir: string): string[] {
  return [join(baseDir, 'capabilities', 'skills'), join(baseDir, 'agent0-assets', 'skills'), join(baseDir, 'skills')]
}

export function resolveAgent0BuiltInCommandsRootCandidates(baseDir: string): string[] {
  return [
    join(baseDir, 'capabilities', 'commands'),
    join(baseDir, 'agent0-assets', 'playbooks'),
    join(baseDir, 'commands'),
  ]
}

function moduleDir(): string {
  return dirname(fileURLToPath(import.meta.url))
}
