import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryPaths: string[] = []

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

afterEach(() => {
  for (const temporaryPath of temporaryPaths.splice(0)) {
    fs.rmSync(temporaryPath, { recursive: true, force: true })
  }
})

describe('brt link --key-stdin CLI process', () => {
  it('reads a redirected key from fd 0 and persists the canonical agent link', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-link-stdin-e2e-'))
    temporaryPaths.push(root)
    const botpressHome = path.join(root, 'home')
    const workDir = path.join(root, 'agent')
    fs.mkdirSync(workDir)
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    writeJson(path.join(botpressHome, 'profiles.json'), {
      default: {
        apiUrl: 'https://profile.example',
        workspaceId: 'ws_profile',
        token: 'workspace_profile_token',
      },
    })
    const perBotKey = `brt_${'k'.repeat(63)}`

    const result = spawnSync(
      'bun',
      [
        path.join(packageRoot, 'src', 'cli.ts'),
        'link',
        '--botId',
        '42',
        '--workspaceId',
        'ws_profile',
        '--keyStdin',
        '--confirm',
        '--json',
        '--botpressHome',
        botpressHome,
        '--workDir',
        workDir,
      ],
      {
        cwd: packageRoot,
        input: `${perBotKey}\n`,
        encoding: 'utf8',
        env: { ...process.env, VITEST: '1' },
      }
    )

    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0)
    expect(JSON.parse(fs.readFileSync(path.join(botpressHome, 'bots.json'), 'utf8'))).toEqual({
      default: { '42': { apiKey: perBotKey } },
    })
    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'agent.json'), 'utf8'))).toEqual({
      botId: '42',
      workspaceId: 'ws_profile',
      apiUrl: 'https://profile.example',
    })
  })
})
