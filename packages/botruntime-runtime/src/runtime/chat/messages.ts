import { z } from '@holocronlab/botruntime-zui'
import _ from 'lodash'
import { isAnyComponent, RenderedComponent } from '@holocronlab/botruntime-llmz'
import { HTML_TAGS } from './html'

export function joinMarkdownChildren(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- children can be any renderable type
  children: any[],
  stringify: (el: unknown) => string = (el) => JSON.stringify(el, null, 2)
): string {
  return children
    .reduce((acc, child, idx) => {
      const isPrimitive = typeof child === 'string' || typeof child === 'number' || typeof child === 'boolean'
      const str = isPrimitive ? (child?.toString() ?? '') : (stringify(child) ?? '')

      if (str.trim().length === 0) {
        return acc
      }

      const leftSymbols = '*_~`"[({-'.split('')
      const rightSymbols = '*_~`"])}-!'.split('')

      const last: string = idx > 0 && acc.at(-1) && typeof acc.at(-1) === 'string' ? acc.at(-1) : ''
      const endsWithSpace = last && last.trimEnd() !== last

      let prev = idx === 0 || endsWithSpace || (last.length && leftSymbols.includes(last.at(-1)!)) ? '' : ' '

      if (str.trimStart() !== str || (str.length && rightSymbols.includes(str.at(0)!))) {
        // If the string starts with a markdown symbol, we don't want to add a space
        prev = ''
      }

      return [...acc, prev, str]
    }, [])
    .join('')
    .trim()
}

export type Message = z.infer<typeof Message>
export const Message = z.object({
  __jsx: z.literal(true),
  type: z.literal('MESSAGE'),
  props: z
    .object({
      type: z
        .enum(['error', 'info', 'success', 'prompt'])
        .default('info')
        .catch(() => 'info'),
    })
    .passthrough(),
  children: z
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zui schema accepts any value
    .array(z.any())
    .default([])
    .transform((children) => {
      // We can receive an array of children as a single child, so we need to flatten it (when it's a map)
      children = children.map((child) => (Array.isArray(child) ? child : [child])).flat()

      const text = joinMarkdownChildren(
        children.filter((x) => !isAnyComponent(x)).map((x) => rebuildTSXCode(x, false))
      ).trim()

      const components = children.filter((child) => isAnyComponent(child))

      return [text, ...components]
    }),
})

/**
 * Converts a JSON object to a JSX string
 * @param node The JSX node to convert
 */
function rebuildTSXCode(node: RenderedComponent | string, hasParent = false): string {
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
    // Plain text or numbers
    return node?.toString() ?? ''
  }

  if (
    typeof node === 'undefined' ||
    node === null ||
    typeof node === 'function' ||
    typeof node === 'symbol' ||
    typeof node === 'boolean'
  ) {
    // Ignore these types
    return ''
  }

  // eslint-disable-next-line prefer-const
  let { type = '', props = {}, children = [] } = node

  if (HTML_TAGS.includes(type.toLowerCase())) {
    // HTML tags are lowercase, so we'll convert them to lowercase
    type = type.toLowerCase()
  }

  // Build opening tag + props
  let openTag = `<${type}`
  Object.entries(props).forEach(([k, v]) => {
    // Naive approach: we'll just embed all props as {JSON.stringify(v)}
    openTag += ` ${k}={${JSON.stringify(v)}}`
  })
  openTag += '>'

  // Recursively build children
  const inner = children.map((child) => rebuildTSXCode(child, true)).join('')

  const closeTag = `</${type}>`

  if (hasParent) {
    return `${openTag}${inner}${closeTag}`
  }

  return `
\`\`\`
${openTag}${inner}${closeTag}
\`\`\``
}
