import { readFileSync } from 'fs'
import { join } from 'path'
import type { KBSyncPlan } from './types.js'
import { KBSyncOperation } from './types.js'

const getAdkVersion = (): string => {
  try {
    const packageJson = require('@holocronlab/botruntime-adk/package.json')
    return packageJson.version
  } catch {
    try {
      const adkPackagePath = join(process.cwd(), 'node_modules/@holocronlab/botruntime-adk/package.json')
      const pkg = JSON.parse(readFileSync(adkPackagePath, 'utf-8'))
      return pkg.version
    } catch {
      return 'unknown'
    }
  }
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count !== 1 ? 's' : ''}`
}

/**
 * Plain text formatter for KB sync plan
 * CLI-agnostic - the CLI should apply colors/styling
 */
export class KBSyncFormatter {
  static format(plan: KBSyncPlan, kbsWithWebsites: string[] = []): string {
    const sections: string[] = []

    sections.push('')
    sections.push(' ▄▀█ █▀▄ █▄▀  Botpress ADK')
    sections.push(` █▀█ █▄▀ █░█  v${getAdkVersion()}`)
    sections.push('')
    sections.push('Knowledge Base Sync')
    sections.push('')

    if (!plan.hasChanges) {
      sections.push('✓ All knowledge bases are up to date.')
      sections.push('')
      return sections.join('\n')
    }

    // Show KBs that need syncing
    const kbsToSync = plan.items.filter((i) => i.operation === KBSyncOperation.Sync)
    const kbsToSkip = plan.items.filter((i) => i.operation === KBSyncOperation.Skip)

    if (kbsToSync.length > 0) {
      sections.push('Knowledge Bases to Sync:\n')

      for (const item of kbsToSync) {
        const icon = item.needsCreation ? '+' : '~'
        const action = item.needsCreation ? 'CREATE' : 'UPDATE'
        sections.push(`  ${icon} ${item.kb.name}`)
        sections.push(`    Action: ${action}`)
        sections.push(`    Reason: ${item.reason}`)

        // Show per-source details
        if (item.sources && item.sources.length > 0) {
          sections.push('    Sources:')
          for (const source of item.sources) {
            if (source.needsSync) {
              const typeLabel = source.dsType === 'document' ? '📁' : '🌐'
              sections.push(`      ${typeLabel} ${source.dsId} (${source.dsType})`)
              sections.push(`         ${source.reason}`)

              // Show file changes for directory sources
              if (source.fileChanges) {
                const { added, modified, deleted } = source.fileChanges
                if (added.length > 0) {
                  sections.push(`         + ${pluralize(added.length, 'file')} to add`)
                }
                if (modified.length > 0) {
                  sections.push(`         ~ ${pluralize(modified.length, 'file')} to update`)
                }
                if (deleted.length > 0) {
                  sections.push(`         - ${pluralize(deleted.length, 'file')} to delete`)
                }
              }
            }
          }
        }
        sections.push('')
      }
    }

    if (kbsToSkip.length > 0) {
      sections.push('Knowledge Bases Already Up to Date:\n')
      for (const item of kbsToSkip) {
        sections.push(`  ✓ ${item.kb.name}`)
      }
      sections.push('')
    }

    // Website sources warning
    if (kbsWithWebsites.length > 0) {
      sections.push('⚠️  Website Sources')
      sections.push('   Website crawling will run asynchronously in the bot runtime.')
      sections.push(`   KBs with websites: ${kbsWithWebsites.join(', ')}`)
      sections.push('')
    }

    // Summary
    sections.push('Summary of Actions\n')

    if (plan.toSync > 0) {
      sections.push(`  • Sync: ${pluralize(plan.toSync, 'knowledge base')}`)
    }
    if (plan.toSkip > 0) {
      sections.push(`  • Skip: ${pluralize(plan.toSkip, 'knowledge base')} (up to date)`)
    }

    sections.push(`  • Sources: ${plan.sourcesToSync} to sync, ${plan.sourcesToSkip} up to date`)
    sections.push('')

    return sections.join('\n')
  }
}
