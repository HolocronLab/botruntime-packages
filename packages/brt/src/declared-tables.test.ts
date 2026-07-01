import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extractDeclaredTables, withColumnIndices } from './declared-tables'

describe('extractDeclaredTables', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-tables-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns an empty array when botruntime.tables.json is absent', () => {
    expect(extractDeclaredTables(dir)).toEqual([])
  })

  it('reads a declared table and stamps x-zui.index in property order', () => {
    fs.writeFileSync(
      path.join(dir, 'botruntime.tables.json'),
      JSON.stringify({
        tables: [{ name: 'Leads', schema: { properties: { name: { type: 'string' }, email: { type: 'string' } } } }],
      })
    )

    const tables = extractDeclaredTables(dir)
    expect(tables).toHaveLength(1)
    expect(tables[0]!.name).toBe('Leads')
    const props = tables[0]!.schema['properties'] as Record<string, { 'x-zui': { index: number } }>
    expect(props['name']!['x-zui'].index).toBe(0)
    expect(props['email']!['x-zui'].index).toBe(1)
  })

  it('accepts a bare top-level array', () => {
    const tables = extractDeclaredTables(
      writeTables(dir, [{ name: 'Foo', schema: { properties: { a: { type: 'string' } } } }])
    )
    expect(tables.map((t) => t.name)).toEqual(['Foo'])
  })

  it('dedups an identical repeated declaration', () => {
    const schema = { properties: { a: { type: 'string' } } }
    const dirPath = writeTables(dir, [
      { name: 'Foo', schema },
      { name: 'Foo', schema },
    ])
    expect(extractDeclaredTables(dirPath)).toHaveLength(1)
  })

  it('fails loud on the same table declared twice with conflicting schemas', () => {
    const dirPath = writeTables(dir, [
      { name: 'Foo', schema: { properties: { a: { type: 'string' } } } },
      { name: 'Foo', schema: { properties: { b: { type: 'string' } } } },
    ])
    expect(() => extractDeclaredTables(dirPath)).toThrow(/declared twice with conflicting schemas/)
  })

  it('fails loud when a table has no name', () => {
    const dirPath = writeTables(dir, [{ schema: { properties: {} } }])
    expect(() => extractDeclaredTables(dirPath)).toThrow(/name is required/)
  })

  it('fails loud when a table has no schema', () => {
    const dirPath = writeTables(dir, [{ name: 'Foo' }])
    expect(() => extractDeclaredTables(dirPath)).toThrow(/schema must be an object/)
  })

  it('fails loud on invalid JSON', () => {
    fs.writeFileSync(path.join(dir, 'botruntime.tables.json'), '{not json')
    expect(() => extractDeclaredTables(dir)).toThrow(/invalid JSON/)
  })
})

describe('withColumnIndices', () => {
  it('fails loud when the schema has no properties object', () => {
    expect(() => withColumnIndices({})).toThrow(/no properties object/)
  })
})

function writeTables(dir: string, tables: unknown[]): string {
  fs.writeFileSync(path.join(dir, 'botruntime.tables.json'), JSON.stringify(tables))
  return dir
}
