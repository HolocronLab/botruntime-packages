import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { linkGeneratedRuntimeDependencies } from '../utils/link-sdk.js'
import { ScriptRunner } from './script-runner.js'

describe('generated script runner dependency contract', () => {
  const temporaryRoots: string[] = []

  afterEach(async () => {
    await Promise.all(
      temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
    )
  })

  it('builds in an isolated Bun workspace with only botruntime-runtime declared by the agent', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'adk-script-runner-isolated-'))
    temporaryRoots.push(root)

    const agentPath = path.join(root, 'agent')
    const botPath = path.join(agentPath, '.adk', 'bot')
    const runtimePath = path.join(root, 'packages', 'botruntime-runtime')
    const sdkPath = path.join(root, 'packages', 'botruntime-sdk')
    const temporaryPath = path.join(root, '.tmp')
    const cachePath = path.join(root, '.bun-cache')
    await Promise.all([
      fs.mkdir(path.join(botPath, 'src'), { recursive: true }),
      fs.mkdir(path.join(botPath, '.botpress'), { recursive: true }),
      fs.mkdir(runtimePath, { recursive: true }),
      fs.mkdir(sdkPath, { recursive: true }),
      fs.mkdir(temporaryPath, { recursive: true }),
      fs.mkdir(cachePath, { recursive: true }),
    ])

    await Promise.all([
      fs.writeFile(
        path.join(root, 'package.json'),
        `${JSON.stringify({ private: true, workspaces: ['agent', 'packages/*'] }, null, 2)}\n`
      ),
      fs.writeFile(
        path.join(agentPath, 'package.json'),
        `${JSON.stringify(
          {
            name: 'isolated-agent',
            private: true,
            dependencies: {
              '@holocronlab/botruntime-runtime': 'workspace:*',
            },
          },
          null,
          2
        )}\n`
      ),
      fs.writeFile(
        path.join(runtimePath, 'package.json'),
        `${JSON.stringify(
          {
            name: '@holocronlab/botruntime-runtime',
            version: '0.0.0-test',
            type: 'module',
            dependencies: {
              '@holocronlab/botruntime-sdk': 'workspace:*',
            },
            exports: {
              '.': './index.js',
              './runtime': './runtime.js',
            },
          },
          null,
          2
        )}\n`
      ),
      fs.writeFile(
        path.join(runtimePath, 'index.js'),
        'export const runtimeLibrary = true\n'
      ),
      fs.writeFile(
        path.join(runtimePath, 'runtime.js'),
        [
          'export function initializeScriptContext() {}',
          'export const handlers = {}',
        ].join('\n')
      ),
      fs.writeFile(
        path.join(sdkPath, 'package.json'),
        `${JSON.stringify(
          {
            name: '@holocronlab/botruntime-sdk',
            version: '6.0.0-test',
            type: 'module',
            exports: {
              '.': './index.js',
            },
          },
          null,
          2
        )}\n`
      ),
      fs.writeFile(path.join(sdkPath, 'index.js'), 'export class BotLogger {}\n'),
      fs.writeFile(
        path.join(botPath, 'package.json'),
        `${JSON.stringify(
          {
            name: '@generated/isolated-agent',
            private: true,
            devDependencies: { typescript: '^5.9.3' },
          },
          null,
          2
        )}\n`
      ),
      fs.writeFile(
        path.join(botPath, 'src', 'adk-runtime.ts'),
        [
          "import { handlers } from '@holocronlab/botruntime-runtime/runtime'",
          'void handlers',
          'export function setupAdkRuntime() {}',
        ].join('\n')
      ),
      fs.writeFile(
        path.join(botPath, '.botpress', 'index.ts'),
        [
          "import { BotLogger } from '@holocronlab/botruntime-sdk'",
          'void BotLogger',
          'export class Bot { constructor(_definition: unknown) {} }',
        ].join('\n')
      ),
      fs.writeFile(
        path.join(botPath, 'tsconfig.json'),
        `${JSON.stringify(
          {
            compilerOptions: {
              baseUrl: '.',
              module: 'esnext',
              moduleResolution: 'bundler',
              target: 'es2022',
            },
          },
          null,
          2
        )}\n`
      ),
    ])

    execFileSync('bun', ['install', '--linker', 'isolated', '--ignore-scripts'], {
      cwd: root,
      stdio: 'pipe',
      env: {
        ...process.env,
        TMPDIR: temporaryPath,
        BUN_INSTALL_CACHE_DIR: cachePath,
      },
    })

    const agentScope = path.join(agentPath, 'node_modules', '@holocronlab')
    expect(existsSync(path.join(agentScope, 'botruntime-runtime'))).toBe(true)
    expect(existsSync(path.join(agentScope, 'botruntime-sdk'))).toBe(false)

    await linkGeneratedRuntimeDependencies(agentPath, botPath)

    const runner = new ScriptRunner({
      projectPath: agentPath,
      credentials: {
        token: 'test-token',
        apiUrl: 'https://example.test',
        workspaceId: 'test-workspace',
      },
    })
    await (
      runner as unknown as { generateScriptRunner(generatedBotPath: string): Promise<void> }
    ).generateScriptRunner(botPath)

    const source = await fs.readFile(path.join(botPath, 'src', 'script-runner.ts'), 'utf8')
    expect(source).not.toMatch(
      /from ['"]@holocronlab\/botruntime-(?:client|cognitive|sdk)['"]/
    )
    expect(source).toMatch(/from ["']@holocronlab\/botruntime-runtime\/runtime["']/)

    expect(existsSync(path.join(agentScope, 'botruntime-client'))).toBe(false)
    expect(existsSync(path.join(agentScope, 'botruntime-cognitive'))).toBe(false)
    expect(existsSync(path.join(agentScope, 'botruntime-sdk'))).toBe(false)
    expect(
      await fs.realpath(
        path.join(botPath, 'node_modules', '@holocronlab', 'botruntime-runtime')
      )
    ).toBe(await fs.realpath(runtimePath))
    expect(
      await fs.realpath(path.join(botPath, 'node_modules', '@holocronlab', 'botruntime-sdk'))
    ).toBe(await fs.realpath(sdkPath))
    expect(existsSync(path.join(botPath, 'node_modules', '@botpress', 'sdk'))).toBe(false)

    const generatedManifest = JSON.parse(
      await fs.readFile(path.join(botPath, 'package.json'), 'utf8')
    ) as { dependencies?: Record<string, string> }
    expect(generatedManifest.dependencies).toEqual({
      '@holocronlab/botruntime-runtime': '0.0.0-test',
      '@holocronlab/botruntime-sdk': '6.0.0-test',
    })

    execFileSync(
      'bun',
      [
        'build',
        path.join(botPath, 'src', 'script-runner.ts'),
        '--target',
        'bun',
        '--outfile',
        path.join(botPath, 'dist', 'script-runner.js'),
      ],
      {
        cwd: agentPath,
        stdio: 'pipe',
        env: {
          ...process.env,
          TMPDIR: temporaryPath,
          BUN_INSTALL_CACHE_DIR: cachePath,
        },
      }
    )

    const userScriptPath = path.join(agentPath, 'audit.ts')
    await fs.writeFile(
      userScriptPath,
      "console.log('ISOLATED_BRT_RUN_OK', process.argv.slice(3).join(','))\n"
    )
    const executionOutput = execFileSync(
      'bun',
      [
        path.join(botPath, 'dist', 'script-runner.js'),
        userScriptPath,
        'first',
        'second',
      ],
      {
        cwd: agentPath,
        encoding: 'utf8',
        env: {
          ...process.env,
          ADK_BOT_ID: 'test-bot',
          ADK_WORKSPACE_ID: 'test-workspace',
          ADK_TOKEN: 'test-token',
          ADK_API_URL: 'https://example.test',
          TMPDIR: temporaryPath,
          BUN_INSTALL_CACHE_DIR: cachePath,
        },
      }
    )
    expect(executionOutput).toContain('ISOLATED_BRT_RUN_OK first,second')
  })
})
