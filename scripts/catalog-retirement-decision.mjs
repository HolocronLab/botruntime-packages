const QUALIFIED_NAME = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/
const ID = /^[A-Za-z0-9-]{1,128}$/

export function decideCatalogRetirement({ name, version, catalog }) {
  if (!QUALIFIED_NAME.test(name)) throw new TypeError('name must be a qualified integration name')
  if (!VERSION.test(version)) throw new TypeError('version must be an exact semver')
  if (!Array.isArray(catalog)) throw new TypeError('catalog must be an array')

  const matches = catalog.filter((entry) => entry?.name === name && entry?.version === version)
  if (matches.length === 0) return { action: 'skip' }
  if (matches.length !== 1) throw new Error(`catalog returned duplicate entries for ${name}@${version}`)

  const id = matches[0]?.id
  if (typeof id !== 'string' || !ID.test(id)) {
    throw new Error(`catalog returned an invalid integration ID for ${name}@${version}`)
  }
  return { action: 'delete', id }
}

if (process.argv[1]?.endsWith('catalog-retirement-decision.mjs')) {
  const [name, version] = process.argv.slice(2)
  if (!name || !version) {
    throw new Error('usage: catalog-retirement-decision.mjs <qualified-name> <version>')
  }

  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  const catalog = JSON.parse(raw)
  process.stdout.write(`${JSON.stringify(decideCatalogRetirement({ name, version, catalog }))}\n`)
}
