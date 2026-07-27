import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { linkGeneratedRuntimeDependencies } from './link-sdk.js'

describe('generated runtime dependency links', () => {
  const temporaryRoots: string[] = []

  afterEach(async () => {
    await Promise.all(
      temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
    )
  })

  const writePackage = async (directory: string, name: string, version: string) => {
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(
      path.join(directory, 'package.json'),
      `${JSON.stringify({ name, version }, null, 2)}\n`
    )
  }

  const createGraph = async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'adk-generated-links-'))
    temporaryRoots.push(root)
    const agentPath = path.join(root, 'agent')
    const botPath = path.join(agentPath, '.adk', 'bot')
    const runtimePath = path.join(root, 'store', 'runtime-current')
    const sdkPath = path.join(root, 'store', 'sdk-current')

    await Promise.all([
      writePackage(runtimePath, '@holocronlab/botruntime-runtime', '2.9.2-test'),
      writePackage(sdkPath, '@holocronlab/botruntime-sdk', '6.19.4-test'),
      fs.mkdir(path.join(agentPath, 'node_modules', '@holocronlab'), { recursive: true }),
      fs.mkdir(path.join(runtimePath, 'node_modules', '@holocronlab'), { recursive: true }),
      fs.mkdir(botPath, { recursive: true }),
    ])
    await Promise.all([
      fs.symlink(
        runtimePath,
        path.join(agentPath, 'node_modules', '@holocronlab', 'botruntime-runtime')
      ),
      fs.symlink(
        sdkPath,
        path.join(runtimePath, 'node_modules', '@holocronlab', 'botruntime-sdk')
      ),
      fs.writeFile(
        path.join(botPath, 'package.json'),
        `${JSON.stringify({ name: '@generated/test', private: true }, null, 2)}\n`
      ),
    ])
    return { root, agentPath, botPath, runtimePath, sdkPath }
  }

  it('repoints stale generated links to the selected runtime closure', async () => {
    const { root, agentPath, botPath, runtimePath, sdkPath } = await createGraph()
    const oldRuntimePath = path.join(root, 'store', 'runtime-old')
    const oldSdkPath = path.join(root, 'store', 'sdk-old')
    await Promise.all([
      writePackage(oldRuntimePath, '@holocronlab/botruntime-runtime', '2.0.0-old'),
      writePackage(oldSdkPath, '@holocronlab/botruntime-sdk', '6.0.0-old'),
      fs.mkdir(path.join(botPath, 'node_modules', '@holocronlab'), { recursive: true }),
    ])
    await Promise.all([
      fs.symlink(
        oldRuntimePath,
        path.join(botPath, 'node_modules', '@holocronlab', 'botruntime-runtime')
      ),
      fs.symlink(
        oldSdkPath,
        path.join(botPath, 'node_modules', '@holocronlab', 'botruntime-sdk')
      ),
    ])

    await linkGeneratedRuntimeDependencies(agentPath, botPath)

    expect(
      await fs.realpath(
        path.join(botPath, 'node_modules', '@holocronlab', 'botruntime-runtime')
      )
    ).toBe(await fs.realpath(runtimePath))
    expect(
      await fs.realpath(path.join(botPath, 'node_modules', '@holocronlab', 'botruntime-sdk'))
    ).toBe(await fs.realpath(sdkPath))
    const manifest = JSON.parse(await fs.readFile(path.join(botPath, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(manifest.dependencies).toEqual({
      '@holocronlab/botruntime-runtime': '2.9.2-test',
      '@holocronlab/botruntime-sdk': '6.19.4-test',
    })
  })

  it('repairs dangling generated links', async () => {
    const { root, agentPath, botPath, runtimePath, sdkPath } = await createGraph()
    await fs.mkdir(path.join(botPath, 'node_modules', '@holocronlab'), { recursive: true })
    await Promise.all([
      fs.symlink(
        path.join(root, 'missing-runtime'),
        path.join(botPath, 'node_modules', '@holocronlab', 'botruntime-runtime')
      ),
      fs.symlink(
        path.join(root, 'missing-sdk'),
        path.join(botPath, 'node_modules', '@holocronlab', 'botruntime-sdk')
      ),
    ])

    await linkGeneratedRuntimeDependencies(agentPath, botPath)

    expect(
      await fs.realpath(
        path.join(botPath, 'node_modules', '@holocronlab', 'botruntime-runtime')
      )
    ).toBe(await fs.realpath(runtimePath))
    expect(
      await fs.realpath(path.join(botPath, 'node_modules', '@holocronlab', 'botruntime-sdk'))
    ).toBe(await fs.realpath(sdkPath))
  })

  it('fails loud instead of deleting an unmanaged dependency directory', async () => {
    const { agentPath, botPath } = await createGraph()
    const unmanagedPath = path.join(
      botPath,
      'node_modules',
      '@holocronlab',
      'botruntime-sdk'
    )
    await fs.mkdir(unmanagedPath, { recursive: true })
    await fs.writeFile(path.join(unmanagedPath, 'KEEP'), 'unmanaged\n')

    await expect(linkGeneratedRuntimeDependencies(agentPath, botPath)).rejects.toThrow(
      /Refusing to replace unmanaged generated dependency path/
    )
    await expect(fs.readFile(path.join(unmanagedPath, 'KEEP'), 'utf8')).resolves.toBe(
      'unmanaged\n'
    )
  })
})
