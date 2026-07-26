import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(__dirname, 'src/gen')

const patch = async (
  relativePath: string,
  before: string,
  after: string,
): Promise<void> => {
  const path = resolve(root, relativePath)
  const source = await readFile(path, 'utf8')
  if (source.includes(after)) return
  const occurrences = source.split(before).length - 1
  if (occurrences !== 1) {
    throw new Error(
      `tables contract patch drift in ${relativePath}: expected one marker, found ${occurrences}`
    )
  }
  await writeFile(path, source.replace(before, after))
}

const patchFirst = async (
  relativePath: string,
  before: string,
  after: string,
): Promise<void> => {
  const path = resolve(root, relativePath)
  const source = await readFile(path, 'utf8')
  if (source.includes(after)) return
  if (!source.includes(before)) {
    throw new Error(`tables contract patch drift in ${relativePath}: marker missing`)
  }
  await writeFile(path, source.replace(before, after))
}

const main = async (): Promise<void> => {
  for (const section of ['public', 'tables']) {
    await patch(
      `${section}/models.ts`,
      '  keyColumn?: string | null;\n',
      `  keyColumn?: string | null;
  keyColumnUnique?: boolean;
  keyColumnUniqueState?: "disabled" | "enabling" | "enabled" | "disabling" | "error";
  keyColumnUniqueOperationId?: string;
  keyColumnUniqueAttempts?: number;
  keyColumnUniqueLastErrorCode?: string;
  uniqueGeneration?: number;
  schemaGeneration?: number;
`
    )

    for (const operation of ['createTable', 'getOrCreateTable']) {
      const path = `${section}/operations/${operation}.ts`
      await patchFirst(
        path,
        '  keyColumn?: string | null;\n',
        `  keyColumn?: string | null;
  /**
   * Opts a newly created table into the physical unique key contract.
   */
  keyColumnUnique?: boolean;
`
      )
      await patch(
        path,
        "'keyColumn': input['keyColumn'],",
        "'keyColumn': input['keyColumn'], 'keyColumnUnique': input['keyColumnUnique'],"
      )
    }

    for (const operation of [
      'getTableRow',
      'findTableRows',
      'createTableRows',
      'updateTableRows',
      'upsertTableRows',
    ]) {
      const path = resolve(root, `${section}/operations/${operation}.ts`)
      const source = await readFile(path, 'utf8')
      const next = source
        .replace(/^    createdAt\?: string;/gm, '    createdAt: string;')
        .replace(/^    updatedAt\?: string;/gm, '    updatedAt: string;')
      if (
        !/^ {4}createdAt: string;$/m.test(next) ||
        !/^ {4}updatedAt: string;$/m.test(next) ||
        /^ {4}createdAt\?: string;$/m.test(next) ||
        /^ {4}updatedAt\?: string;$/m.test(next)
      ) {
        throw new Error(`tables row metadata patch drift in ${section}/${operation}`)
      }
      if (next !== source) {
        await writeFile(path, next)
      }
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
