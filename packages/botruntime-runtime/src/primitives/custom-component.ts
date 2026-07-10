import type { FC } from 'react'
import type { z } from '@holocronlab/botruntime-sdk'
import type { Definitions } from './definition'

/**
 * Metadata for custom component discovery, preview, and autonomous usage.
 *
 * The dev console uses this metadata to render installed component previews:
 * `props` drives the props form, `exampleValues` seed preview props, and
 * `description` is shown alongside the component. Conversations also use the
 * same metadata to tell the LLM when and how to yield the component.
 */
export type CustomComponentMetadata = {
  /** A description of what this component does, shown in the dev console and to the LLM. */
  description: string
  /** Zod schema defining the component's props — used for preview forms and LLM prop validation. */
  // oxlint-disable-next-line no-explicit-any -- Zui schema requires any for broad ZodObject compatibility
  props: z.ZodObject<any>
  /** Example prop values for dev console previews and LLM usage examples. */
  exampleValues: Record<string, unknown>[]
}

/** @deprecated Use `CustomComponentMetadata`. */
export type LlmMetadata = CustomComponentMetadata

/** Convert a prop value to its JSX attribute representation */
function toJsxAttr(value: unknown): string {
  if (typeof value === 'string') return `"${value.replace(/"/g, '\\"')}"`
  if (typeof value === 'number' || typeof value === 'boolean') return `{${value}}`
  return `{${JSON.stringify(value)}}`
}

/** Build a self-closing JSX tag from a component name and prop values */
export function buildExampleJsx(name: string, values: Record<string, unknown>): string {
  const attrs = Object.entries(values)
    .map(([k, v]) => `${k}=${toJsxAttr(v)}`)
    .join(' ')
  return attrs ? `<${name} ${attrs} />` : `<${name} />`
}

export namespace Typings {
  // oxlint-disable-next-line no-explicit-any -- Generic default requires any for FC props
  export type Props<TProps = any> = FC<TProps>
  export const Primitive = 'customComponent' as const
}

// oxlint-disable-next-line no-explicit-any -- Generic default requires any for FC props
export class BaseCustomComponent<TProps = any> implements Definitions.Primitive {
  public readonly name: string
  public readonly _component: FC<TProps>
  public readonly metadata: CustomComponentMetadata | undefined
  /** @deprecated Use `metadata`. */
  public readonly llmMetadata: CustomComponentMetadata | undefined
  private _url: string | undefined

  /**
   * Create a custom React component for webchat rendering.
   *
   * @param component - The React function component to render in webchat.
   * @param metadata - Optional component metadata. The dev console uses it for installed
   *   previews and props playgrounds; conversations use it so the LLM can yield this
   *   component during autonomous execution.
   *
   * @example
   * ```ts
   * // Plain component. It can be rendered directly, but has no preview metadata
   * // and cannot be listed in Conversation.components.
   * new CustomComponent(MyBanner)
   *
   * // With component metadata. Enables dev console previews and LLM usage.
   * new CustomComponent(TicketCard, {
   *   description: 'Display a ticket summary card',
   *   props: z.object({ ticketId: z.string(), title: z.string() }),
   *   exampleValues: [{ ticketId: 'TKT-001', title: 'VPN broken' }],
   * })
   * ```
   */
  constructor(component: FC<TProps>, metadata?: CustomComponentMetadata) {
    this.name = component.displayName || component.name || 'UnnamedComponent'
    this._component = component
    this.metadata = metadata
    this.llmMetadata = metadata
  }

  /** Whether this component has metadata for dev console previews and LLM usage. */
  get hasMetadata(): boolean {
    return this.metadata !== undefined
  }

  /** @deprecated Use `hasMetadata`. */
  get hasLlmMetadata(): boolean {
    return this.hasMetadata
  }

  /** @internal - set by the component registry at bot init */
  _setUrl(url: string) {
    this._url = url
  }

  encode(props: TProps): { url: string; name: string; data: TProps } {
    if (!this._url) {
      throw new Error(`Component "${this.name}" not deployed. Run "brt deploy --adk".`)
    }
    return { url: this._url, name: this.name, data: props }
  }

  /** @internal */
  getDefinition(): Definitions.CustomComponentDefinition {
    return { type: 'customComponent', name: this.name }
  }
}
