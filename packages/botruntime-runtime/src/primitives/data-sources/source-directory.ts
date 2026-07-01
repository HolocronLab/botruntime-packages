import { z } from '@holocronlab/botruntime-sdk'
import { DataSource, createSyncWorkflow, Item } from './source-base'
import type { ExtraFileTags } from './source-base'
import { adk } from '../../library'
import { WellKnownMetadata } from '../../constants'

type DirectorySourceOptions = {
  id?: string
  filter?: (filePath: string) => boolean
  /**
   * Extra tags applied to every file ingested by this source, on top of the
   * well-known KB/source identity tags. Either a static record or a function
   * resolved per upload. Reserved keys are ignored.
   *
   * @example { tags: { team: 'docs' } }
   */
  tags?: ExtraFileTags
}

type Metadata = {
  hash: string
  dsId: string
  dsType: string
  relPath: string
  [WellKnownMetadata.knowledge.TITLE]?: string
}

type LocalFile = {
  abs: string
  rel: string
  name: string
}

export class DirectorySource extends DataSource {
  private _directoryPath: string
  private _filterFn: ((filePath: string) => boolean) | undefined

  public constructor(id: string, directoryPath: string, options: DirectorySourceOptions = {}) {
    super(id, 'document', { tags: options.tags })
    this._directoryPath = directoryPath
    this._filterFn = options.filter ?? undefined
  }

  /** Get the directory path for this source */
  public get directoryPath(): string {
    return this._directoryPath
  }

  /** Get the filter function for this source */
  public get filterFn(): ((filePath: string) => boolean) | undefined {
    return this._filterFn
  }

  /** Get serializable configuration for change detection */
  public getConfig(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      directoryPath: this._directoryPath,
      filterFn: this._filterFn?.toString() || null,
    }
  }

  public get syncWorkflow() {
    return createSyncWorkflow({
      type: 'directory',
      state: z.object({}),
      handler: async ({ input, step, client }) => {
        if (!adk.environment.isDevelopment()) {
          console.log('Directory ingestion is only supported in development environment')

          return {
            added: [],
            updated: [],
            deleted: [],
            errors: [],
            processed: 0,
          }
        }

        if (input.force) {
          console.log('🔄 FORCE MODE: Re-indexing all files regardless of changes')
        }

        const glob = await import('glob')
        const path = await import('path')
        const fs = await import('fs/promises')
        const crypto = await import('crypto') // TODO: move these to top-level

        const directory = path.resolve(adk.environment.agent.directory, this.directoryPath)

        const scopeTags = this.baseFileTags(input)
        const tags = this.fileTags(input)

        if (!directory.startsWith(adk.environment.agent.directory)) {
          throw new Error("Directory path must be within the agent's directory")
        }

        const allFiles = await step('list directory files', () =>
          glob
            .sync(directory + '/**/*.*', {
              absolute: true,
              nodir: true,
            })
            .filter((file) => {
              if (this.filterFn) {
                try {
                  return this.filterFn(file)
                } catch (err) {
                  console.error(`Error applying filter to file ${file}:`, err)
                  return false
                }
              }
              return true
            })
            .map<LocalFile>((f) => ({
              abs: f,
              rel: path.relative(directory, f),
              name: path.basename(f),
            }))
        )

        const existingFiles = await step('list existing files', () =>
          client._inner.list
            .files({
              tags: scopeTags,
            })
            .collect()
        )

        const toRemove = existingFiles.filter(
          (f) => !allFiles.find((af) => af.rel === (f.metadata as Metadata)?.relPath)
        )

        const toAdd = allFiles.filter((af) => !existingFiles.find((f) => (f.metadata as Metadata)?.relPath === af.rel))

        const toUpdate = allFiles.filter((af) =>
          existingFiles.find((f) => (f.metadata as Metadata)?.relPath === af.rel)
        )

        const deleted = await step.map(
          'deleting removed files',
          toRemove,
          (f) =>
            client
              .deleteFile({ id: f.id })
              .catch(() => null)
              .then(
                () =>
                  ({
                    file: f.id,
                    name: f.key,
                    hash: (f.metadata as Metadata)?.hash || '',
                    size: f.size ?? -1,
                  }) satisfies Item
              ),
          { concurrency: 5 }
        )

        const upsertFile = async (local: LocalFile): Promise<Item | null> => {
          const key = `data_source://${this.type}/${this.id}/${local.rel}`

          const content = await fs.readFile(local.abs)
          const hash = crypto.createHash('sha256').update(content).digest('hex')

          const { file } = await client.getFile({ id: key }).catch(() => ({ file: null }))

          // Check if file has failed status - always re-index failed files
          const isFailed =
            file?.status === 'indexing_failed' || file?.status === 'upload_failed' || file?.status === 'upload_pending'
          const tagsChanged = !this.fileTagsMatch(file, tags)

          if (!input.force && !isFailed && file?.metadata?.hash === hash) {
            if (tagsChanged) {
              console.log(`Updating tags for unchanged file: ${local.rel}`)
              await client.updateFileMetadata({ id: file.id, tags: this.fileTagsPatch(file, tags) })
              return { file: file.id, hash, name: key, size: file.size ?? -1 }
            } else {
              console.log(`Skipping unchanged file: ${local.rel}`)
              return null
            }
          }

          if (isFailed) {
            console.log(`Re-indexing failed file (status: ${file?.status}): ${local.rel}`)
          } else if (input.force && file?.metadata?.hash === hash) {
            console.log(`Force re-indexing file (unchanged): ${local.rel}`)
          }

          // Extract title from filename (remove extension)
          const title = path.basename(local.name, path.extname(local.name))

          const uploaded = await client.uploadFile({
            key,
            content,
            accessPolicies: [],
            tags,
            index: true,
            indexing: {
              configuration: {
                vision: {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type mismatch
                  indexPages: true as any,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type mismatch
                  transcribePages: true as any,
                },
                summarization: {
                  enable: false,
                },
              },
            },
            metadata: {
              hash,
              dsId: this.id,
              dsType: this.type,
              relPath: local.rel,
              [WellKnownMetadata.knowledge.TITLE]: title,
            } satisfies Metadata,
          })

          return {
            file: uploaded.file.id,
            hash,
            name: key,
            size: uploaded.file.size ?? -1,
          }
        }

        const added = await step.map('to add files', toAdd, (f) => upsertFile(f), { concurrency: 5, maxAttempts: 2 })

        const updated = await step.map('to update files', toUpdate, (f) => upsertFile(f), {
          concurrency: 5,
          maxAttempts: 2,
        })

        return {
          processed: allFiles.length,
          deleted,
          added: added.filter((f) => f !== null),
          updated: updated.filter((f) => f !== null),
          errors: [],
        }
      },
    })
  }

  static fromPath(directoryPath: string, options: DirectorySourceOptions = {}): DirectorySource {
    const id = options.id || `directory_${directoryPath.replace(/\//g, '_')}`
    return new DirectorySource(id, directoryPath, options)
  }
}
