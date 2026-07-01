import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isValidConfigVarName, readSecretValue } from './cloud-io'

describe('isValidConfigVarName', () => {
  it('accepts names matching ^[A-Za-z_][A-Za-z0-9_]*$', () => {
    expect(isValidConfigVarName('FOO')).toBe(true)
    expect(isValidConfigVarName('foo_bar')).toBe(true)
    expect(isValidConfigVarName('_private')).toBe(true)
    expect(isValidConfigVarName('a1')).toBe(true)
  })

  it('rejects names starting with a digit, or containing invalid characters', () => {
    expect(isValidConfigVarName('1bad')).toBe(false)
    expect(isValidConfigVarName('bad-name')).toBe(false)
    expect(isValidConfigVarName('bad.name')).toBe(false)
    expect(isValidConfigVarName('bad name')).toBe(false)
    expect(isValidConfigVarName('')).toBe(false)
  })
})

describe('readSecretValue', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-cloud-io-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reads the value from --value-file, stripping a single trailing newline', async () => {
    const file = path.join(dir, 'value.txt')
    fs.writeFileSync(file, 'hunter2\n')
    await expect(readSecretValue('value', file)).resolves.toBe('hunter2')
  })

  it('preserves internal newlines, only the trailing one is stripped', async () => {
    const file = path.join(dir, 'value.txt')
    fs.writeFileSync(file, 'line1\nline2\n')
    await expect(readSecretValue('value', file)).resolves.toBe('line1\nline2')
  })

  it('fails loud when the file value is empty', async () => {
    const file = path.join(dir, 'empty.txt')
    fs.writeFileSync(file, '')
    await expect(readSecretValue('value', file)).rejects.toThrow(/empty value/)
  })
})
