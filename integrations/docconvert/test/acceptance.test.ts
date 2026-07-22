import { describe, expect, test } from 'bun:test'
import { OPS, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { DocConvertClient } from '../src/docconvert-client'

const serviceUrl = process.env.DOCONVERT_ACCEPTANCE_SERVICE_URL
const agentsRepo = process.env.DOCONVERT_ACCEPTANCE_AGENTS_REPO
const authToken = process.env.DOCONVERT_ACCEPTANCE_AUTH_TOKEN
const agentsRef = process.env.DOCONVERT_ACCEPTANCE_AGENTS_REF ?? 'main'
const rewriteHttpsToLocalHttp = process.env.DOCONVERT_ACCEPTANCE_LOCAL_HTTP === '1'
const enabled = Boolean(serviceUrl && agentsRepo)

describe.skipIf(!enabled)('Gotenberg reference-document acceptance', () => {
  test('claim keeps Cyrillic anchors, exactly two pages and at least two images', async () => {
    const result = await convertReference('lawyer/templates/claim.docx')

    expect(result.pageCount).toBe(2)
    expect(result.text).toContain('Претензия.')
    expect(result.text).toContain('Банковские Реквизиты')
    expect(result.imagePaints).toBeGreaterThanOrEqual(2)
  }, 60_000)

  test('power of attorney keeps Cyrillic anchor and exactly two pages', async () => {
    const result = await convertReference('lawyer/templates/poa_template.docx')

    expect(result.pageCount).toBe(2)
    expect(result.text).toContain('ДОВЕРЕННОСТЬ')
  }, 60_000)
})

async function convertReference(path: string): Promise<{ pageCount: number; text: string; imagePaints: number }> {
  const source = await gitShow(`${agentsRef}:${path}`)
  const client = new DocConvertClient(
    { serviceUrl: serviceUrl!, authToken },
    rewriteHttpsToLocalHttp
      ? { fetchImpl: (input, init) => fetch(localHttpUrl(input), init) }
      : {},
  )
  const { bytes } = await client.convertDocxBytes(source)
  const pdf = await getDocument({ data: bytes }).promise
  const text: string[] = []
  let imagePaints = 0
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    text.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '))
    const operators = await page.getOperatorList()
    imagePaints += operators.fnArray.filter((operator) =>
      operator === OPS.paintImageXObject ||
      operator === OPS.paintInlineImageXObject ||
      operator === OPS.paintImageMaskXObject,
    ).length
  }
  return { pageCount: pdf.numPages, text: text.join('\n'), imagePaints }
}

function localHttpUrl(input: string | URL | Request): string | URL | Request {
  const url = input instanceof Request ? input.url : input.toString()
  const parsed = new URL(url)
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error('DOCONVERT_ACCEPTANCE_LOCAL_HTTP may only rewrite localhost')
  }
  parsed.protocol = 'http:'
  return parsed
}

async function gitShow(spec: string): Promise<Uint8Array> {
  const result = Bun.spawnSync(['git', '-C', agentsRepo!, 'show', spec])
  if (result.exitCode !== 0) {
    throw new Error(`git show ${spec} failed: ${new TextDecoder().decode(result.stderr).trim()}`)
  }
  return Uint8Array.from(result.stdout)
}
