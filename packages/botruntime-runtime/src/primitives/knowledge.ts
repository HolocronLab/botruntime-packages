import { Definitions } from './definition'
import { DataSourceBase } from './data-sources'
import { KnowledgeIndexingWorkflow } from '../runtime/workflows/knowledge-indexing'
import { SyncInput } from './data-sources/source-base'
import type { BaseWorkflowInstance } from './workflow-instance'
import { context } from '../runtime'
import { WellKnownTags, WellKnownMetadata } from '../constants'

export namespace Typings {
  export type Props = {
    name: string
    description?: string
    sources: DataSourceBase[]
  }

  export const Primitive = 'knowledge' as const
}

/** Metadata associated with a knowledge base search passage, used for citation tracking. */
export type KnowledgePassageMetadata = {
  /** The file key/path of the source document */
  file?: string
  /** The title of the source document or page */
  title?: string
  /** The URL of the source document or page */
  url?: string
  /** The favicon URL of the source website */
  favicon?: string
  /** A brief description of the source document */
  description?: string
  /** The name of the knowledge base this passage belongs to */
  knowledgeBase?: string
  /** The Botpress ID of the knowledge base */
  knowledgeBaseId?: string
  /** The type of the data source (e.g. "document", "web-page") */
  dsType?: string
  /** The ID of the data source this passage was ingested from */
  dsId?: string
}

/** A single passage returned from a knowledge base search. */
export type KnowledgeSearchPassage = {
  /** The text content of the passage */
  content: string
  /** Metadata about the source of this passage */
  metadata: KnowledgePassageMetadata
}

/** Options for searching a knowledge base. */
export type KnowledgeSearchOptions = {
  /** Number of surrounding passages to include for context (1–20). @default 4 */
  contextDepth?: number
  /** Maximum number of passages to return (1–50). @default 20 */
  limit?: number
}

/** The result of searching one or more knowledge bases. */
export type KnowledgeSearchResult = {
  /** The matching passages found across the searched knowledge bases */
  passages: KnowledgeSearchPassage[]
}

export class BaseKnowledge implements Definitions.Primitive {
  public readonly name: string
  public readonly sources: DataSourceBase[]
  public readonly description?: string

  constructor(props: Typings.Props) {
    this.name = props.name
    this.sources = props.sources
    this.description = props.description!
    // TODO: validate the sources here
  }

  /** @internal */
  public getDefinition(): Definitions.KnowledgeDefinition {
    return {
      type: 'knowledge',
      name: this.name,
      description: this.description!,
      sources: this.sources,
    }
  }

  /**
   * Look up the KB ID from Botpress
   */
  private async getKbId(): Promise<string> {
    const client = context.get('client')._inner
    const kbs = await client.list.knowledgeBases({}).collect()
    const remoteKb = kbs.find((k) => k.name === this.name)
    if (!remoteKb) {
      throw new Error(`KB '${this.name}' not found in botruntime - run 'brt deploy --adk' or approve KB sync in 'brt dev'`)
    }
    return remoteKb.id
  }

  /**
   * Refresh the knowledge base by triggering the built-in indexing workflow for all sources
   * This will fetch data from all data sources and update the knowledge base
   * @param force - If true, forces re-indexing of all data even if unchanged
   * @returns The indexing workflow instance, so callers can await its completion or
   *   inspect its status. The workflow runs asynchronously regardless.
   */
  async refresh(options?: Partial<{ force?: boolean }>): Promise<BaseWorkflowInstance<'builtin_knowledge_indexing'>> {
    const kbId = await this.getKbId()

    return await KnowledgeIndexingWorkflow.getOrCreate({
      key: `kb:${this.name}`,
      input: {
        kbName: this.name,
        kbId,
        force: options?.force || false,
      },
    })
  }

  /**
   * Search this knowledge base for relevant passages.
   * Returns passages with metadata suitable for citation tracking.
   */
  async search(query: string, options?: KnowledgeSearchOptions): Promise<KnowledgeSearchResult> {
    const client = context.get('client')

    if (!client) {
      throw new Error('Client is not available in this context. Make sure to run in a context with a client.')
    }

    const { passages } = await client.searchFiles({
      query,
      includeBreadcrumb: true,
      consolidate: true,
      contextDepth: Math.min(20, Math.max(1, options?.contextDepth ?? 4)),
      limit: Math.min(50, Math.max(1, options?.limit ?? 20)),
      tags: {
        [WellKnownTags.knowledge.KNOWLEDGE]: 'knowledge-base',
        [WellKnownTags.knowledge.KNOWLEDGE_BASE_NAME]: [this.name],
      },
    })

    return {
      passages: passages.map((p) => {
        // oxlint-disable-next-line no-explicit-any -- SDK file type doesn't include metadata property
        const fileMetadata = (p.file as any).metadata || {}
        const tags = p.file.tags || {}

        const metadata: KnowledgePassageMetadata = {}

        if (p.file.key) {
          metadata.file = p.file.key
        }
        if (fileMetadata[WellKnownMetadata.knowledge.TITLE] || tags.title) {
          metadata.title = fileMetadata[WellKnownMetadata.knowledge.TITLE] || tags.title
        }
        if (fileMetadata[WellKnownMetadata.knowledge.URL]) {
          metadata.url = fileMetadata[WellKnownMetadata.knowledge.URL]
        }
        if (fileMetadata[WellKnownMetadata.knowledge.FAVICON]) {
          metadata.favicon = fileMetadata[WellKnownMetadata.knowledge.FAVICON]
        }
        if (fileMetadata[WellKnownMetadata.knowledge.DESCRIPTION]) {
          metadata.description = fileMetadata[WellKnownMetadata.knowledge.DESCRIPTION]
        }
        if (tags[WellKnownTags.knowledge.KNOWLEDGE_BASE_NAME]) {
          metadata.knowledgeBase = tags[WellKnownTags.knowledge.KNOWLEDGE_BASE_NAME]!
        }
        if (tags[WellKnownTags.knowledge.KNOWLEDGE_BASE_ID]) {
          metadata.knowledgeBaseId = tags[WellKnownTags.knowledge.KNOWLEDGE_BASE_ID]!
        }
        if (tags[WellKnownTags.knowledge.KNOWLEDGE_SOURCE_TYPE]) {
          metadata.dsType = tags[WellKnownTags.knowledge.KNOWLEDGE_SOURCE_TYPE]!
        }
        if (tags[WellKnownTags.knowledge.KNOWLEDGE_SOURCE_ID]) {
          metadata.dsId = tags[WellKnownTags.knowledge.KNOWLEDGE_SOURCE_ID]!
        }

        // Remove invalid or overly large values
        for (const key of Object.keys(metadata) as (keyof KnowledgePassageMetadata)[]) {
          const value = metadata[key]
          if (!value || value.trim().length === 0 || value.length > 1024) {
            delete metadata[key]
          }
        }

        return { content: p.content, metadata }
      }),
    }
  }

  /**
   * Refresh a specific data source by its ID
   *
   * @param dsId - The ID of the data source to refresh
   * @param force - If true, forces re-indexing of all data even if unchanged
   * @returns The sync workflow instance for this source, so callers can await its
   *   completion or inspect its status. The workflow runs asynchronously regardless.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- syncWorkflow is BaseWorkflow<any>
  async refreshSource(dsId: string, options?: Partial<{ force?: boolean }>): Promise<BaseWorkflowInstance<any>> {
    const source = this.sources.find((s) => s.id === dsId)
    if (!source) {
      throw new Error(`Data source with id "${dsId}" not found in knowledge base "${this.name}"`)
    }

    const kbId = await this.getKbId()

    return await source.syncWorkflow.getOrCreate({
      key: `${this.name}:${dsId}`,
      input: {
        kbName: this.name,
        kbId,
        dsId: dsId,
        force: options?.force || false,
      } satisfies SyncInput,
    })
  }
}
