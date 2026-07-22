import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

import { decideCatalogRetirement } from './catalog-retirement-decision.mjs'

test('deletes the one owned exact name and version by resolved ID', () => {
  const decision = decideCatalogRetirement({
    name: 'botruntime/docconvert',
    version: '0.1.0',
    catalog: [
      { id: '43', name: 'botruntime/docconvert', version: '0.1.0', visibility: 'public' },
      { id: '44', name: 'botruntime/cloudconvert', version: '0.1.0', visibility: 'public' },
    ],
  })

  assert.deepEqual(decision, { action: 'delete', id: '43' })
})

test('skips an already absent tombstone', () => {
  assert.deepEqual(decideCatalogRetirement({
    name: 'botruntime/docconvert',
    version: '0.1.0',
    catalog: [],
  }), { action: 'skip' })
})

test('fails closed on duplicate records or an invalid provider ID', () => {
  assert.throws(() => decideCatalogRetirement({
    name: 'botruntime/docconvert',
    version: '0.1.0',
    catalog: [
      { id: '43', name: 'botruntime/docconvert', version: '0.1.0' },
      { id: '45', name: 'botruntime/docconvert', version: '0.1.0' },
    ],
  }), /duplicate/)
  assert.throws(() => decideCatalogRetirement({
    name: 'botruntime/docconvert',
    version: '0.1.0',
    catalog: [{ id: '../43', name: 'botruntime/docconvert', version: '0.1.0' }],
  }), /invalid integration ID/)
  assert.throws(() => decideCatalogRetirement({
    name: 'botruntime/docconvert',
    version: '0.1.0-beta',
    catalog: [],
  }), /exact semver/)
})

test('repository tombstones are unique, exact and absent from active integration sources', () => {
  const retired = JSON.parse(readFileSync(
    new URL('./catalog-retired-integrations.json', import.meta.url),
    'utf8',
  ))
  const refs = retired.map(({ name, version }) => `${name}@${version}`)
  assert.equal(new Set(refs).size, refs.length)

  for (const { name, version, reason } of retired) {
    assert.deepEqual(decideCatalogRetirement({ name, version, catalog: [] }), { action: 'skip' })
    assert.equal(typeof reason, 'string')
    assert.ok(reason.length > 0)
    const sourceName = name.split('/').at(-1)
    assert.equal(existsSync(new URL(`../integrations/${sourceName}`, import.meta.url)), false)
  }
})

test('catalog workflow retires tombstones only after publishing active integrations', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/publish-integrations-catalog.yml', import.meta.url),
    'utf8',
  )
  const publish = workflow.indexOf('name: Publish all integrations globally')
  const retire = workflow.indexOf('name: Retire tombstoned integrations')

  assert.ok(publish >= 0 && retire > publish)
  assert.match(workflow, /catalog-retired-integrations\.json/)
  assert.match(workflow, /catalog-retirement-decision\.mjs/)
  assert.match(workflow, /brt integrations list[\s\S]*?--owned/)
  assert.match(workflow, /brt integrations delete "\$qualified_name@\$version"/)
})
