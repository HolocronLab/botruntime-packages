import { watch, readdirSync, statSync, mkdirSync } from 'fs'
import { EventEmitter } from 'events'
import { dirname, join, relative, sep } from 'path'
import { existsSync } from 'fs'

export type WatchChangeType = 'added' | 'modified' | 'deleted'

export interface FileChange {
  path: string
  type: WatchChangeType
}

export interface FileChangeEvent {
  changes: FileChange[]
  timestamp: number
}

export interface FileWatcherOptions {
  projectPath: string
  debounceMs?: number
}

/**
 * File watcher for ADK agent projects
 *
 * Watches the following patterns:
 * - src/**\/*
 * - agent.config.ts
 * - package.json
 * - agent.json
 */
export class FileWatcher extends EventEmitter {
  private projectPath: string
  private watchers: Map<string, ReturnType<typeof watch>> = new Map()
  private fileStates: Map<string, number> = new Map()
  private debounceMs: number
  private debounceTimer: NodeJS.Timeout | null = null
  private pendingChanges: Map<string, FileChange> = new Map()
  private pendingRootMtimeCheck: Set<string> | null = null

  constructor(options: FileWatcherOptions) {
    super()
    this.projectPath = options.projectPath
    this.debounceMs = options.debounceMs ?? 100
  }

  /**
   * Start watching files
   */
  start(): void {
    // Root files are watched through ONE non-recursive watcher on the project
    // directory, filtered by name — NOT one fs.watch per file. A per-file watch
    // handle sticks to the inode it was opened on, so the first atomic save
    // (write temp + rename over the target — how editors and Claude Code write)
    // replaces the inode and silences the watcher for every save after it.
    const rootFiles = ['package.json', 'agent.json', 'agent.config.ts']
    for (const file of rootFiles) {
      const filePath = join(this.projectPath, file)
      if (existsSync(filePath)) {
        this.updateFileState(filePath)
      }
    }
    this.watchRootFiles(new Set(rootFiles))

    // Watch src directory recursively
    const srcPath = join(this.projectPath, 'src')
    if (existsSync(srcPath)) {
      // Initialize state for all existing files BEFORE setting up watchers
      this.initializeDirectoryState(srcPath)
      // Now set up the watcher
      this.watchDirectory(srcPath)
    }

    // Dependency snapshots live under .adk. They are generated from Cloud and
    // still need to trigger regen/restart when a dependency mutation refreshes
    // local state.
    const dependencySnapshotsPath = join(this.projectPath, '.adk', 'dependencies')
    mkdirSync(dependencySnapshotsPath, { recursive: true })
    if (existsSync(dependencySnapshotsPath)) {
      this.initializeDirectoryState(dependencySnapshotsPath)
      this.watchDirectory(dependencySnapshotsPath)
    }
  }

  /**
   * Initialize state for all files in a directory (recursive)
   */
  private initializeDirectoryState(dirPath: string): void {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)
        if (entry.isDirectory()) {
          this.initializeDirectoryState(fullPath)
        } else if (entry.isFile()) {
          this.updateFileState(fullPath)
        }
      }
    } catch {
      // Ignore errors during initialization
    }
  }

  /**
   * Watch the project-root config files (package.json, agent.json,
   * agent.config.ts) via a single non-recursive directory watcher, filtered by
   * name. Events for anything else in the root (temp files, node_modules
   * shuffles) are ignored. Directory watches report renames by NAME, so atomic
   * saves keep working — and a root file created later is picked up too.
   */
  private watchRootFiles(rootFileNames: Set<string>): void {
    if (this.watchers.has(this.projectPath)) {
      return
    }

    try {
      const watcher = watch(this.projectPath, { persistent: true }, (_eventType, filename) => {
        if (filename && rootFileNames.has(filename)) {
          this.handleFileChange(join(this.projectPath, filename))
          return
        }
        // Event for something else in the root — often the vanished temp half
        // of an atomic save whose rename target never got its own event (the
        // same macOS gap handled for src/ in handleFileChange). Re-check just
        // the tracked root files by mtime; never walk the root directory
        // (node_modules lives there). Coalesced behind the debounce so rapid
        // root events (e.g. both halves of an atomic save) trigger at most one
        // stat sweep per debounce window.
        this.scheduleRootMtimeCheck(rootFileNames)
      })

      this.watchers.set(this.projectPath, watcher)
    } catch (error) {
      console.warn(`Failed to watch project root ${this.projectPath}:`, error)
    }
  }

  /**
   * Coalesce root mtime sweeps: mark one pending and piggyback on the next
   * debounce tick. Multiple rapid root events (both halves of an atomic save,
   * node_modules churn) collapse into a single stat sweep.
   */
  private scheduleRootMtimeCheck(rootFileNames: Set<string>): void {
    if (this.pendingRootMtimeCheck) {
      return
    }
    this.pendingRootMtimeCheck = rootFileNames
    this.scheduleDebouncedEmit()
  }

  private checkRootFilesByMtime(rootFileNames: Set<string>): void {
    for (const name of rootFileNames) {
      const fullPath = join(this.projectPath, name)
      const tracked = this.fileStates.get(fullPath)
      let mtime: number | undefined
      try {
        mtime = statSync(fullPath).mtimeMs
      } catch {
        mtime = undefined // file absent
      }

      let changeType: WatchChangeType
      if (tracked === undefined && mtime !== undefined) {
        changeType = 'added'
        this.fileStates.set(fullPath, mtime)
      } else if (tracked !== undefined && mtime === undefined) {
        changeType = 'deleted'
        this.fileStates.delete(fullPath)
      } else if (tracked !== undefined && mtime !== undefined && mtime !== tracked) {
        changeType = 'modified'
        this.fileStates.set(fullPath, mtime)
      } else {
        continue // untouched (or absent and untracked)
      }

      const relativePath = relative(this.projectPath, fullPath)
      this.pendingChanges.set(relativePath, { path: relativePath, type: changeType })
      this.scheduleDebouncedEmit()
    }
  }

  /**
   * Watch a directory recursively
   */
  private watchDirectory(dirPath: string): void {
    if (this.watchers.has(dirPath)) {
      return
    }

    try {
      const watcher = watch(dirPath, { recursive: true, persistent: true }, (_eventType, filename) => {
        if (filename) {
          const fullPath = join(dirPath, filename)
          this.handleFileChange(fullPath)
        }
      })

      this.watchers.set(dirPath, watcher)
    } catch (error) {
      console.warn(`Failed to watch directory ${dirPath}:`, error)
    }
  }

  /**
   * Handle file change events - accumulates changes for batch emission
   */
  private handleFileChange(filePath: string): void {
    // On Linux, fs.watch may report directory changes instead of individual files.
    // When a directory change is detected, scan it for new/deleted files.
    try {
      if (existsSync(filePath) && statSync(filePath).isDirectory()) {
        this.scanDirectoryForChanges(filePath)
        return
      }
    } catch {
      // statSync may fail if file was deleted between checks
    }

    const fileExists = existsSync(filePath)
    const previousState = this.fileStates.get(filePath)

    let changeType: WatchChangeType

    if (!fileExists && previousState !== undefined) {
      // File was deleted
      changeType = 'deleted'
      this.fileStates.delete(filePath)
    } else if (fileExists && previousState === undefined) {
      // File was added
      changeType = 'added'
      this.updateFileState(filePath)
    } else if (fileExists) {
      // File was modified
      changeType = 'modified'
      this.updateFileState(filePath)
    } else {
      // An event for a path that doesn't exist and was never tracked. This is
      // the signature of an ATOMIC SAVE (write `.target.tmp`, rename over the
      // target — how VS Code, vim, and Claude Code write files): on macOS,
      // fs.watch often reports only the vanished temp name and never the
      // rename target, so the real change would be silently dropped. Rescan
      // the parent directory (mtime-aware) to pick up the replaced sibling.
      // Bounded to the src tree — the project root is name-filtered upstream
      // (watchRootFiles), and rescanning it would walk node_modules.
      const parentDir = dirname(filePath)
      const srcPath = join(this.projectPath, 'src')
      if (parentDir === srcPath || parentDir.startsWith(srcPath + sep)) {
        this.scanDirectoryForChanges(parentDir)
      }
      return
    }

    const relativePath = relative(this.projectPath, filePath)

    // Add to pending changes (overwrites previous change for same file)
    this.pendingChanges.set(relativePath, {
      path: relativePath,
      type: changeType,
    })

    this.scheduleDebouncedEmit()
  }

  /**
   * Emit all pending changes as a single event
   */
  private emitPendingChanges(): void {
    // Flush any deferred root mtime sweep before emitting — this collapses
    // multiple rapid root events into one stat sweep per debounce window.
    if (this.pendingRootMtimeCheck) {
      const rootFiles = this.pendingRootMtimeCheck
      this.pendingRootMtimeCheck = null
      this.checkRootFilesByMtime(rootFiles)
    }

    if (this.pendingChanges.size === 0) {
      return
    }

    const changes = Array.from(this.pendingChanges.values())
    this.pendingChanges.clear()

    const event: FileChangeEvent = {
      changes,
      timestamp: Date.now(),
    }

    this.emit('change', event)
  }

  /**
   * Scan a directory for added, deleted, or silently-replaced files compared
   * to tracked state. Used on Linux where fs.watch reports directory-level
   * events, and on macOS to recover atomic saves whose rename target never
   * got its own event (modification detected by mtime, see handleFileChange).
   */
  private scanDirectoryForChanges(dirPath: string): void {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })
      const currentFiles = new Set<string>()

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)
        if (entry.isFile()) {
          currentFiles.add(fullPath)
          const trackedMtime = this.fileStates.get(fullPath)
          if (trackedMtime === undefined) {
            // New file detected
            this.updateFileState(fullPath)
            const relativePath = relative(this.projectPath, fullPath)
            this.pendingChanges.set(relativePath, { path: relativePath, type: 'added' })
            this.scheduleDebouncedEmit()
          } else {
            // Tracked file: a changed mtime means it was replaced or rewritten
            // without its own watch event (atomic-save rename).
            let mtime: number | undefined
            try {
              mtime = statSync(fullPath).mtimeMs
            } catch {
              // Deleted between readdir and stat — the deletion pass below
              // (or a later event) handles it.
            }
            if (mtime !== undefined && mtime !== trackedMtime) {
              this.fileStates.set(fullPath, mtime)
              const relativePath = relative(this.projectPath, fullPath)
              this.pendingChanges.set(relativePath, { path: relativePath, type: 'modified' })
              this.scheduleDebouncedEmit()
            }
          }
        } else if (entry.isDirectory()) {
          this.scanDirectoryForChanges(fullPath)
        }
      }

      // Check for deleted files in this directory
      for (const [trackedPath] of this.fileStates) {
        if (trackedPath.startsWith(dirPath) && !trackedPath.includes('/', dirPath.length + 1)) {
          if (!currentFiles.has(trackedPath)) {
            this.fileStates.delete(trackedPath)
            const relativePath = relative(this.projectPath, trackedPath)
            this.pendingChanges.set(relativePath, { path: relativePath, type: 'deleted' })
            this.scheduleDebouncedEmit()
          }
        }
      }
    } catch {
      // Directory may have been deleted
    }
  }

  /**
   * Schedule a debounced emission of pending changes
   */
  private scheduleDebouncedEmit(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      this.emitPendingChanges()
    }, this.debounceMs)
  }

  /**
   * Update internal file state tracking. Stores the file's mtime (not the
   * observation time) so scanDirectoryForChanges can detect files replaced
   * behind the watcher's back by comparing against the current mtime.
   */
  private updateFileState(filePath: string): void {
    try {
      this.fileStates.set(filePath, statSync(filePath).mtimeMs)
    } catch {
      // File vanished between the triggering event and the stat — drop the
      // tracking entry; a later event for this path re-adds it.
      this.fileStates.delete(filePath)
    }
  }

  /**
   * Stop watching all files
   */
  stop(): void {
    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    // Close all watchers
    for (const watcher of this.watchers.values()) {
      watcher.close()
    }
    this.watchers.clear()
    this.fileStates.clear()
    this.pendingChanges.clear()
    this.pendingRootMtimeCheck = null
  }

  /**
   * Type-safe event listener
   */
  on(event: 'change', listener: (event: FileChangeEvent) => void): this {
    return super.on(event, listener)
  }

  /**
   * Type-safe event emitter
   */
  emit(event: 'change', data: FileChangeEvent): boolean {
    return super.emit(event, data)
  }
}
