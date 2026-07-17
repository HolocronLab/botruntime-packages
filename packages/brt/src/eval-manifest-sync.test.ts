import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { syncEvalManifest } from './eval-manifest-sync'

describe('hosted eval manifest sync', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })))

  it('uploads immutable private fixtures and a sanitized manifest', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-eval-fixtures-'))
    roots.push(root)
    fs.mkdirSync(path.join(root, 'fixtures'))
    fs.writeFileSync(path.join(root, 'fixtures', 'ddu.pdf'), Buffer.from('private-pdf'))
    const uploads: Array<Record<string, unknown>> = []
    const uploadFile = vi.fn(async (input: Record<string, unknown> & { content: Buffer; contentType: string; key: string }) => {
      uploads.push(input)
      const content = input.content
      return {
        file: {
          id: input.key === 'evals/manifest.json' ? 'manifest_1' : 'fixture_1',
          size: content.byteLength,
          contentType: input.contentType,
        },
      }
    })

    const result = await syncEvalManifest({
      projectDir: root,
      definitions: [
        {
          name: 'document',
          fixtures: {
            ddu: { path: 'fixtures/ddu.pdf', name: 'D.pdf', contentType: 'application/pdf' },
          },
          conversation: [{ user: 'file', attachments: [{ fixture: 'ddu' }] }],
        },
      ],
      client: { uploadFile },
    })

    expect(result).toEqual({
      manifestFileId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      fixtures: 1,
      evals: 1,
    })
    expect(uploads[0]).toMatchObject({
      key: expect.stringMatching(/^eval-fixtures\/[a-f0-9]{64}\/D\.pdf$/),
      contentType: 'application/pdf',
      accessPolicies: [],
      metadata: { fixtureId: 'ddu', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
    })
    const manifestUpload = uploads[1]!
    expect(manifestUpload).toMatchObject({ accessPolicies: [] })
    const manifest = JSON.parse(Buffer.from(manifestUpload.content as Buffer).toString('utf8'))
    expect(manifest).toMatchObject({
      schemaVersion: 2,
      manifestId: result.manifestFileId,
      evals: [{ name: 'document', conversation: [{ attachments: [{ fixture: 'ddu' }] }] }],
      fixtures: {
        ddu: {
          fileId: 'fixture_1',
          name: 'D.pdf',
          contentType: 'application/pdf',
          size: Buffer.byteLength('private-pdf'),
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      },
    })
    expect(JSON.stringify(manifest)).not.toContain('fixtures/ddu.pdf')
    expect(JSON.stringify(manifest)).not.toContain('private-pdf')
  })

  it('rejects traversal and undeclared fixture references before upload', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-eval-fixtures-'))
    roots.push(root)
    const uploadFile = vi.fn()

    await expect(
      syncEvalManifest({
        projectDir: root,
        definitions: [
          {
            name: 'bad',
            fixtures: { secret: { path: '../secret.pdf', contentType: 'application/pdf' } },
            conversation: [{ attachments: [{ fixture: 'missing' }] }],
          },
        ],
        client: { uploadFile },
      })
    ).rejects.toThrow(/undeclared|outside/i)
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('rejects fixture symlinks that escape the agent project', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-eval-fixtures-'))
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-eval-secret-'))
    roots.push(root, outside)
    fs.writeFileSync(path.join(outside, 'secret.pdf'), 'secret')
    fs.symlinkSync(path.join(outside, 'secret.pdf'), path.join(root, 'fixture.pdf'))
    const uploadFile = vi.fn()

    await expect(
      syncEvalManifest({
        projectDir: root,
        definitions: [
          {
            name: 'bad_symlink',
            fixtures: { secret: { path: 'fixture.pdf', contentType: 'application/pdf' } },
            conversation: [{ attachments: [{ fixture: 'secret' }] }],
          },
        ],
        client: { uploadFile },
      })
    ).rejects.toThrow(/outside/i)
    expect(uploadFile).not.toHaveBeenCalled()
  })
})
