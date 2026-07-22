import { describe, expect, test } from 'bun:test'
import { OPS, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { CloudConvertClient } from '../src/cloudconvert-client'

const apiKey = process.env.CLOUDCONVERT_ACCEPTANCE_API_KEY
const agentsRepo = process.env.CLOUDCONVERT_ACCEPTANCE_AGENTS_REPO
const agentsRef = process.env.CLOUDCONVERT_ACCEPTANCE_AGENTS_REF ?? 'main'
const enabled = Boolean(apiKey && agentsRepo)

describe.skipIf(!enabled)('CloudConvert reference-document acceptance', () => {
  test('claim keeps Cyrillic anchors, two pages and at least two images', async () => {
    const result = await convertReference('lawyer/templates/claim.docx')

    expect(result.pageCount).toBe(2)
    expect(result.text).toContain('Претензия.')
    expect(result.text).toContain('Банковские Реквизиты')
    expect(result.imagePaints).toBeGreaterThanOrEqual(2)
  }, 90_000)

  test('power of attorney keeps Cyrillic anchor and two pages', async () => {
    const result = await convertReference('lawyer/templates/poa_template.docx')

    expect(result.pageCount).toBe(2)
    expect(result.text).toContain('ДОВЕРЕННОСТЬ')
  }, 90_000)
})

async function convertReference(path: string): Promise<{ pageCount: number; text: string; imagePaints: number }> {
  const source = await gitShow(`${agentsRef}:${path}`)
  const { bytes } = await new CloudConvertClient({ apiKey: apiKey! }).convertDocxBytes(source)
  const pdf = await getDocument({ data: bytes }).promise
  const text: string[] = []
  let imagePaints = 0
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    text.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '))
    const operators = await page.getOperatorList()
    imagePaints += operators.fnArray.filter((operator) =>
      operator === OPS.paintImageXObject
      || operator === OPS.paintInlineImageXObject
      || operator === OPS.paintImageMaskXObject,
    ).length
  }
  return { pageCount: pdf.numPages, text: text.join('\n'), imagePaints }
}

async function gitShow(spec: string): Promise<Uint8Array> {
  const result = Bun.spawnSync(['git', '-C', agentsRepo!, 'show', spec])
  if (result.exitCode !== 0) {
    throw new Error(`git show ${spec} failed: ${new TextDecoder().decode(result.stderr).trim()}`)
  }
  return Uint8Array.from(result.stdout)
}
