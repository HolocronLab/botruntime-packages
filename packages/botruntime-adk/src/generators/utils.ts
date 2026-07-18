import path from 'path'

// Lazy-load oxfmt because it has a native binding that isn't available
// in compiled binaries. The dynamic import lets us catch the failure
// gracefully and fall back to unformatted code.
let _format: ((file: string, code: string) => Promise<{ code: string }>) | null = null
let _formatLoaded = false

async function getFormat() {
  if (!_formatLoaded) {
    _formatLoaded = true
    try {
      const oxfmt = await import('oxfmt')
      _format = oxfmt.format
    } catch {
      // Native binding unavailable (e.g. compiled binary) — formatting disabled
    }
  }
  return _format
}

export const formatCode = async (code: string, filepath?: string): Promise<string> => {
  try {
    // Skip formatting if code is empty or too large
    if (!code || code.length > 1_000_000) {
      return code
    }

    const format = await getFormat()
    if (!format) return code

    const fileName = filepath || 'file.ts'
    const result = await format(fileName, code)

    return result.code
  } catch (err) {
    console.warn('Failed to format code with oxfmt:', err)
    console.warn(
      code
        .slice(0, 1000)
        .split('\n')
        .map((l, i) => `\t${i.toString().padStart(2, '0')} | ${l}`)
        .join('\n')
    )
    return code
  }
}

// These constants are injected at build time by esbuild's define.
declare const __RUNTIME_VERSION__: string
declare const __BP_CLI_VERSION__: string

export const ADK_VERSION =
  typeof __RUNTIME_VERSION__ === 'undefined'
    ? ((globalThis as { __RUNTIME_VERSION__?: string }).__RUNTIME_VERSION__ ?? '0.0.0')
    : __RUNTIME_VERSION__

export const BRT_VERSION =
  typeof __BP_CLI_VERSION__ === 'undefined'
    ? ((globalThis as { __BP_CLI_VERSION__?: string }).__BP_CLI_VERSION__ ?? '0.0.0')
    : __BP_CLI_VERSION__

export const relative = (from: string, to: string): string => {
  const fromDir = path.dirname(from)
  const relative = path.relative(fromDir, to)
  return relative.startsWith('.') ? relative : `./${relative}`
}

export function toMultilineComment(comment: string): string {
  // Handle empty or null comments
  if (!comment || comment.trim() === '') {
    return ''
  }

  // Escape potentially dangerous characters in the comment
  // Replace */ with *\/ to prevent premature comment closure
  let safeComment = comment.replace(/\*\//g, '*\\/')

  // Split by newlines to handle multi-line comments
  // Handle all line ending types: \r\n (Windows), \n (Unix), \r (old Mac)
  const lines = safeComment.split(/\r\n|\r|\n/)

  // If single line and short enough, return inline comment
  if (lines.length === 1 && lines[0] && lines[0].length <= 60) {
    return `/** ${lines[0]} */`
  }

  // For multi-line comments, format with proper indentation
  let result = '/**\n'
  for (const line of lines) {
    // Trim trailing whitespace but preserve leading whitespace for formatting
    const trimmedLine = line.replace(/\s+$/, '')
    result += ` * ${trimmedLine}\n`
  }
  result += ' */'

  return result
}
