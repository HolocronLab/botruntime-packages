import * as semver from 'semver'

export interface SearchableCatalogEntry {
  name: string
  version: string
  updatedAt?: string
  title?: string
  description?: string
}

export interface RankedCatalogEntry<T extends SearchableCatalogEntry> {
  entry: T
  rank: number
}

export function collectCatalogSearchResult<T extends SearchableCatalogEntry>(
  results: Map<string, RankedCatalogEntry<T>>,
  entry: T,
  query: string
): void {
  const rank = getCatalogSearchRank(entry, query)
  if (rank === undefined) {
    return
  }

  const key = entry.name.toLowerCase()
  const existing = results.get(key)
  if (!existing || isBetterCatalogResult({ entry, rank }, existing)) {
    results.set(key, { entry, rank })
  }
}

export function getSortedCatalogSearchResults<T extends SearchableCatalogEntry>(
  results: Map<string, RankedCatalogEntry<T>>,
  limit: number
): T[] {
  return [...results.values()]
    .sort(
      (a, b) =>
        a.rank - b.rank || a.entry.name.localeCompare(b.entry.name) || compareVersions(b.entry.version, a.entry.version)
    )
    .slice(0, limit)
    .map(({ entry }) => entry)
}

export function getSortedVersions(versions: Iterable<string>): string[] {
  return [...versions].sort((a, b) => compareVersions(b, a))
}

function getCatalogSearchRank(entry: SearchableCatalogEntry, query: string): number | undefined {
  const q = normalize(query)
  if (!q) {
    return 0
  }

  const name = normalize(entry.name)
  const title = normalize(entry.title)
  const description = normalize(entry.description)

  if (name === q) return 0
  if (title === q) return 1
  if (name.startsWith(q)) return 2
  if (title.startsWith(q)) return 3
  if (name.includes(q)) return 4
  if (title.includes(q)) return 5
  if (description.includes(q)) return 6

  return undefined
}

function isBetterCatalogResult<T extends SearchableCatalogEntry>(
  candidate: RankedCatalogEntry<T>,
  existing: RankedCatalogEntry<T>
): boolean {
  if (candidate.rank !== existing.rank) {
    return candidate.rank < existing.rank
  }

  const versionComparison = compareVersions(candidate.entry.version, existing.entry.version)
  if (versionComparison !== 0) {
    return versionComparison > 0
  }

  return (candidate.entry.updatedAt ?? '').localeCompare(existing.entry.updatedAt ?? '') > 0
}

function compareVersions(a: string, b: string): number {
  const validA = semver.valid(a)
  const validB = semver.valid(b)

  if (validA && validB) {
    return semver.compare(validA, validB)
  }

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}
