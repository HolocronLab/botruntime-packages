export function decideCatalogPublication({ name, version, catalog }) {
  if (!Array.isArray(catalog)) {
    throw new TypeError('catalog must be an array')
  }

  const isAlreadyPublic = catalog.some(
    (entry) =>
      entry?.name === name &&
      entry?.version === version &&
      (entry?.visibility === 'public' || entry?.public === true),
  )
  return isAlreadyPublic ? 'skip' : 'publish'
}

if (process.argv[1]?.endsWith('catalog-publication-decision.mjs')) {
  const [name, version] = process.argv.slice(2)
  if (!name || !version) {
    throw new Error('usage: catalog-publication-decision.mjs <qualified-name> <version>')
  }

  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  const catalog = JSON.parse(raw)
  process.stdout.write(`${decideCatalogPublication({ name, version, catalog })}\n`)
}
