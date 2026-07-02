import { watch, FSWatcher } from 'fs'
import { EventEmitter } from 'events'
import path from 'path'
import { FileChangeEvent, FileChangeType } from './types.js'
import { AdkError } from '@holocronlab/botruntime-analytics'

export interface FileWatcherOptions {
  ignore?: string[]
  debounce?: number
}

export class FileWatcher extends EventEmitter {
  private watcher?: FSWatcher
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private ignoredPatterns: RegExp[]
  private debounceMs: number

  constructor(
    private basePath: string,
    options: FileWatcherOptions = {}
  ) {
    super()
    this.ignoredPatterns = (options.ignore || []).map((pattern) => {
      // Convert glob-like patterns to regex
      const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.')
      return new RegExp(`^${regexPattern}$`)
    })
    this.debounceMs = options.debounce || 100
  }

  start(): void {
    if (this.watcher) {
      throw new AdkError({ code: 'WATCHER_ALREADY_STARTED', expected: false, message: 'Watcher already started' })
    }

    this.watcher = watch(this.basePath, { recursive: true }, (eventType, filename) => {
      if (!filename) return

      const fullPath = path.join(this.basePath, filename)
      const relativePath = filename

      // Check if file should be ignored
      if (this.shouldIgnore(relativePath)) {
        return
      }

      // Debounce file changes
      const existingTimer = this.debounceTimers.get(fullPath)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }

      const timer = setTimeout(() => {
        this.debounceTimers.delete(fullPath)

        let changeType: FileChangeType
        if (eventType === 'rename') {
          // In many cases, 'rename' means the file was added or deleted
          // We'd need to check if the file exists to determine which
          changeType = FileChangeType.Modified
        } else {
          changeType = FileChangeType.Modified
        }

        const event: FileChangeEvent = {
          type: changeType,
          path: fullPath,
          relativePath,
        }

        this.emit('change', event)
      }, this.debounceMs)

      this.debounceTimers.set(fullPath, timer)
    })

    this.watcher.on('error', (error) => {
      this.emit('error', error)
    })
  }

  stop(): void {
    if (!this.watcher) {
      return
    }

    // Clear all pending timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()

    // Close the watcher
    this.watcher.close()
    this.watcher = undefined
  }

  private shouldIgnore(relativePath: string): boolean {
    // Always ignore some common patterns
    const defaultIgnored = [/^\.git\//, /^node_modules\//, /^dist\//, /^\.adk\//, /\.DS_Store$/]

    const allPatterns = [...defaultIgnored, ...this.ignoredPatterns]
    return allPatterns.some((pattern) => pattern.test(relativePath))
  }
}
