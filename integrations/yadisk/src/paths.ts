const SCHEME_RE = /^[a-z]+:\//i

export function resolveAppPath(folder: string, relativePath: string): string {
  const root = folder.trim() === '' ? '' : normalizeRelativePath(folder, 'yadiskFolder')
  const path = normalizeRelativePath(relativePath, 'path')
  return `app:/${[root, path].filter(Boolean).join('/')}`
}

export function normalizeRelativePath(value: string, field: string): string {
  if (SCHEME_RE.test(value)) {
    throw new Error(`${field}: ожидается относительный путь без схемы app:/ или disk:/`)
  }
  const segments = value
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
  if (segments.length === 0) {
    throw new Error(`${field}: путь не должен быть пустым`)
  }
  if (segments.some((s) => s === '.' || s === '..')) {
    throw new Error(`${field}: сегменты . и .. запрещены`)
  }
  return segments.join('/')
}
