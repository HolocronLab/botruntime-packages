import type { EvalFixtureManifestEntry, ResolvedEvalFixture } from '@holocronlab/botruntime-evals'

type FixtureFileClient = {
  getFile(input: { id: string }): Promise<{
    file: {
      id: string
      url: string
      size: number | null
      contentType: string
      metadata: Record<string, unknown>
      status: string
    }
  }>
}

export function createHostedFixtureResolver(
  fixtures: Record<string, EvalFixtureManifestEntry>,
  client: FixtureFileClient
): (fixture: string) => Promise<ResolvedEvalFixture> {
  return async (fixture) => {
    const declared = fixtures[fixture]
    if (!declared) throw new Error(`Eval fixture '${fixture}' is not declared in the hosted manifest.`)

    const { file } = await client.getFile({ id: declared.fileId })
    if (
      file.id !== declared.fileId ||
      file.status !== 'upload_completed' ||
      file.size !== declared.size ||
      file.contentType !== declared.contentType ||
      file.metadata.sha256 !== declared.sha256
    ) {
      throw new Error(`Eval fixture '${fixture}' metadata mismatch; redeploy fixtures before running evals.`)
    }

    return {
      fixture,
      name: declared.name,
      contentType: declared.contentType,
      size: declared.size,
      sha256: declared.sha256,
      url: file.url,
    }
  }
}
