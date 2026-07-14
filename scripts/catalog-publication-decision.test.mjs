import assert from 'node:assert/strict'
import test from 'node:test'

import { decideCatalogPublication } from './catalog-publication-decision.mjs'

test('skips an already public exact name and version', () => {
  const decision = decideCatalogPublication({
    name: 'botruntime/megaplan',
    version: '0.2.1',
    catalog: [{ name: 'botruntime/megaplan', version: '0.2.1', visibility: 'public', public: true }],
  })

  assert.equal(decision, 'skip')
})

test('publishes a missing version', () => {
  const decision = decideCatalogPublication({
    name: 'botruntime/yadisk',
    version: '0.2.1',
    catalog: [{ name: 'botruntime/yadisk', version: '0.1.0', visibility: 'public', public: true }],
  })

  assert.equal(decision, 'publish')
})

test('does not treat a private exact version as globally published', () => {
  const decision = decideCatalogPublication({
    name: 'botruntime/yadisk',
    version: '0.2.1',
    catalog: [{ name: 'botruntime/yadisk', version: '0.2.1', visibility: 'private', public: false }],
  })

  assert.equal(decision, 'publish')
})
