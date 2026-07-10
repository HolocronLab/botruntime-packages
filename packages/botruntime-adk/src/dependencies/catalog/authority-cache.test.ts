import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogService, type CatalogRef, type CatalogSource } from './catalog-service.js'

interface Definition {
  id: string
  marker: string
}

const ref: CatalogRef = { name: 'same-name', version: '1.0.0' }
const updatedAt = '2026-07-10T00:00:00.000Z'

describe('catalog cache authority', () => {
  const temporaryRoots: string[] = []

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  const createSource = (cacheRoot: string, marker: string) => {
    const fetchByRef = vi.fn(async () => ({
      id: 'same-id',
      updatedAt,
      definition: { id: 'same-id', marker },
    }))
    const source: CatalogSource<Definition> = {
      cacheConfig: { cacheType: 'integrations', idField: 'integrationId', cacheRoot },
      fetchByRef,
    }
    return { source, fetchByRef }
  }

  it('does not read legacy or foreign-stack definitions under an explicit authority', async () => {
    const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-catalog-authority-'))
    temporaryRoots.push(cacheRoot)
    const legacy = createSource(cacheRoot, 'LEGACY_FOREIGN')
    const firstStack = createSource(cacheRoot, 'FIRST_STACK')
    const secondStack = createSource(cacheRoot, 'SECOND_STACK')

    expect(await new CatalogService(legacy.source).getDefinition(ref)).toEqual({
      id: 'same-id',
      marker: 'LEGACY_FOREIGN',
    })
    expect(
      await new CatalogService(firstStack.source, false, {
        apiUrl: 'https://first.example/',
        workspaceId: 'workspace',
      }).getDefinition(ref)
    ).toEqual({ id: 'same-id', marker: 'FIRST_STACK' })
    expect(
      await new CatalogService(secondStack.source, false, {
        apiUrl: 'https://second.example',
        workspaceId: 'workspace',
      }).getDefinition(ref)
    ).toEqual({ id: 'same-id', marker: 'SECOND_STACK' })

    expect(legacy.fetchByRef).toHaveBeenCalledOnce()
    expect(firstStack.fetchByRef).toHaveBeenCalledOnce()
    expect(secondStack.fetchByRef).toHaveBeenCalledOnce()
  })

  it('shares a cache only for the same normalized non-secret authority', async () => {
    const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-catalog-authority-'))
    temporaryRoots.push(cacheRoot)
    const writer = createSource(cacheRoot, 'AUTHORITATIVE')
    const reader = createSource(cacheRoot, 'SHOULD_NOT_FETCH')

    await new CatalogService(writer.source, false, {
      apiUrl: 'https://same.example/',
      workspaceId: 'same_workspace',
    }).getDefinition(ref)
    const cached = await new CatalogService(reader.source, false, {
      apiUrl: 'https://same.example',
      workspaceId: 'same_workspace',
    }).getDefinition(ref)

    expect(cached.marker).toBe('AUTHORITATIVE')
    expect(reader.fetchByRef).not.toHaveBeenCalled()
    const serializedPaths = fs
      .readdirSync(path.join(cacheRoot, 'integrations', 'authorities'))
      .join('\n')
    expect(serializedPaths).not.toContain('https')
    expect(serializedPaths).not.toContain('workspace')
  })

  it('validates authority before returning a preseeded cache hit', async () => {
    const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-catalog-authority-'))
    temporaryRoots.push(cacheRoot)
    const authority = { apiUrl: 'https://guarded.example', workspaceId: 'guarded_workspace' }
    const writer = createSource(cacheRoot, 'CACHED')
    const reader = createSource(cacheRoot, 'SHOULD_NOT_FETCH')
    await new CatalogService(writer.source, false, authority).getDefinition(ref)
    const validateAuthority = vi.fn(async () => {
      throw new Error('authority rejected before cache')
    })

    await expect(
      new CatalogService(reader.source, false, authority, validateAuthority).getDefinition(ref)
    ).rejects.toThrow(/rejected before cache/)
    expect(validateAuthority).toHaveBeenCalledOnce()
    expect(reader.fetchByRef).not.toHaveBeenCalled()
  })

  it('does not write cache files when cache use is disabled for a missing authority', async () => {
    const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-catalog-authority-'))
    temporaryRoots.push(cacheRoot)
    const source = createSource(cacheRoot, 'UNCACHED')

    expect(await new CatalogService(source.source, false, undefined, undefined, true).getDefinition(ref)).toEqual({
      id: 'same-id',
      marker: 'UNCACHED',
    })
    expect(fs.existsSync(path.join(cacheRoot, 'integrations'))).toBe(false)
  })
})
