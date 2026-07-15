import { describe, expect, it } from 'vitest'
import yargs, { cleanupConfig } from '@holocronlab/botruntime-yargs-extra'
import { schemas } from './config'

const watchSchema = { watch: schemas.dev.watch }
const deployWatchSchema = { watch: schemas.deploy.watch }

const parseWatch = (args: string[]) => {
  const argv = yargs(args).option('watch', schemas.dev.watch).parseSync()
  return cleanupConfig(watchSchema, argv)
}

const parseDeployWatch = (args: string[]) => {
  const argv = yargs(args).option('watch', schemas.deploy.watch).parseSync()
  return cleanupConfig(deployWatchSchema, argv)
}

describe('config schemas', () => {
  it('enables dev file watching by default', () => {
    expect(parseWatch([])).toEqual({ watch: true })
  })

  it('parses --no-watch as disabled dev file watching', () => {
    expect(parseWatch(['--no-watch'])).toEqual({ watch: false })
  })

  it('keeps deploy one-shot by default and enables its loop only with --watch', () => {
    expect(parseDeployWatch([])).toEqual({ watch: false })
    expect(parseDeployWatch(['--watch'])).toEqual({ watch: true })
  })

  it('keeps dev --adk only as a hidden deprecated migration guard', () => {
    expect(schemas.dev.adk).toMatchObject({ hidden: true, deprecated: true })
  })

  it('uses the cloud endpoint by default and keeps an explicit advanced login override', () => {
    expect(schemas.login.apiUrl).toMatchObject({ default: 'https://botruntime.ru' })
  })

  it('keeps the internal stack override out of public help', () => {
    expect(schemas.cloudProject.local).toMatchObject({ hidden: true })
    expect(schemas.deploy.local).toMatchObject({ hidden: true })
    expect(schemas.dev.local).toMatchObject({ hidden: true })
  })

  it('exposes only the transport implemented by the bundled Chat integration', () => {
    expect(schemas.chat.protocol).toMatchObject({ choices: ['polling'], default: 'polling' })
  })
})
