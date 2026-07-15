import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  EVAL_MANIFEST_SCHEMA_VERSION,
  EVAL_MANIFEST_TAGS,
  type EvalDefinition,
  type EvalFixtureManifestEntry,
  type EvalFixtureSource,
  type EvalManifest,
} from '@holocronlab/botruntime-evals'

const FIXTURE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const MAX_FIXTURE_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_FIXTURE_BYTES = 100 * 1024 * 1024

type UploadFileClient = {
  uploadFile(input: {
    key: string
    content: Buffer
    contentType: string
    accessPolicies: Array<'integrations'>
    tags: Record<string, string>
    metadata: Record<string, unknown>
  }): Promise<{ file: { id: string; size: number | null; contentType: string } }>
}

type PreparedFixture = {
  id: string
  source: EvalFixtureSource
  bytes: Buffer
  name: string
  sha256: string
}

function safeFixturePath(projectDir: string, fixture: string, source: EvalFixtureSource): string {
  if (!FIXTURE_ID.test(fixture)) throw new Error(`Eval fixture id '${fixture}' is malformed.`)
  if (!source.contentType || /[\r\n]/.test(source.contentType)) {
    throw new Error(`Eval fixture '${fixture}' has an invalid contentType.`)
  }
  const root = fs.realpathSync(path.resolve(projectDir))
  const absolute = path.resolve(root, source.path)
  const real = fs.realpathSync(absolute)
  if (real !== root && !real.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Eval fixture '${fixture}' points outside the agent project.`)
  }
  return real
}

function sanitizedDefinitions(definitions: EvalDefinition[]): EvalDefinition[] {
  return definitions.map(({ fixtures: _fixtures, ...definition }) => definition)
}

export async function syncEvalManifest(input: {
  projectDir: string
  definitions: EvalDefinition[]
  client: UploadFileClient
}): Promise<{ manifestFileId: string; fixtures: number; evals: number }> {
  const sources = new Map<string, EvalFixtureSource>()
  for (const definition of input.definitions) {
    for (const [fixture, source] of Object.entries(definition.fixtures ?? {})) {
      const previous = sources.get(fixture)
      if (previous && JSON.stringify(previous) !== JSON.stringify(source)) {
        throw new Error(`Eval fixture '${fixture}' has conflicting declarations.`)
      }
      sources.set(fixture, source)
    }
  }

  const referenced = new Set<string>()
  for (const definition of input.definitions) {
    for (const turn of definition.conversation) {
      if ((turn.attachments?.length ?? 0) > 32) throw new Error(`Eval turn has too many attachments.`)
      for (const attachment of turn.attachments ?? []) referenced.add(attachment.fixture)
    }
  }
  for (const fixture of referenced) {
    if (!sources.has(fixture)) throw new Error(`Eval fixture '${fixture}' is referenced but undeclared.`)
  }

  const prepared: PreparedFixture[] = []
  let totalBytes = 0
  for (const fixture of [...referenced].sort()) {
    const source = sources.get(fixture)!
    const absolute = safeFixturePath(input.projectDir, fixture, source)
    const bytes = fs.readFileSync(absolute)
    if (bytes.byteLength > MAX_FIXTURE_BYTES) throw new Error(`Eval fixture '${fixture}' exceeds 20 MiB.`)
    totalBytes += bytes.byteLength
    if (totalBytes > MAX_TOTAL_FIXTURE_BYTES) throw new Error('Eval fixtures exceed 100 MiB in total.')
    const name = source.name ?? path.basename(absolute)
    if (!name || path.basename(name) !== name || /[\u0000-\u001f\u007f]/.test(name)) {
      throw new Error(`Eval fixture '${fixture}' has an invalid name.`)
    }
    prepared.push({
      id: fixture,
      source,
      bytes,
      name,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
  }

  const fixtures: Record<string, EvalFixtureManifestEntry> = {}
  for (const fixture of prepared) {
    const uploaded = await input.client.uploadFile({
      key: `eval-fixtures/${fixture.sha256}/${fixture.name}`,
      content: fixture.bytes,
      contentType: fixture.source.contentType,
      // Files are tenant-private by default. The hosted runtime reads them through
      // the authenticated control-plane API; declaring an unenforced integration
      // policy makes current platform versions reject the upload.
      accessPolicies: [],
      tags: { source: 'adk', type: 'eval-fixture', schemaVersion: `${EVAL_MANIFEST_SCHEMA_VERSION}` },
      metadata: { fixtureId: fixture.id, sha256: fixture.sha256 },
    })
    if (uploaded.file.size !== fixture.bytes.byteLength || uploaded.file.contentType !== fixture.source.contentType) {
      throw new Error(`Eval fixture '${fixture.id}' upload metadata mismatch.`)
    }
    fixtures[fixture.id] = {
      fileId: uploaded.file.id,
      name: fixture.name,
      contentType: fixture.source.contentType,
      size: fixture.bytes.byteLength,
      sha256: fixture.sha256,
    }
  }

  const manifest: EvalManifest = {
    schemaVersion: EVAL_MANIFEST_SCHEMA_VERSION,
    evals: sanitizedDefinitions(input.definitions),
    ...(Object.keys(fixtures).length > 0 ? { fixtures } : {}),
  }
  const content = Buffer.from(JSON.stringify(manifest))
  const uploaded = await input.client.uploadFile({
    key: 'evals/manifest.json',
    content,
    contentType: 'application/json',
    accessPolicies: [],
    tags: EVAL_MANIFEST_TAGS,
    metadata: { schemaVersion: EVAL_MANIFEST_SCHEMA_VERSION },
  })
  if (uploaded.file.size !== content.byteLength || uploaded.file.contentType !== 'application/json') {
    throw new Error('Eval manifest upload metadata mismatch.')
  }

  return { manifestFileId: uploaded.file.id, fixtures: prepared.length, evals: input.definitions.length }
}
