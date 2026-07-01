import { context } from './context/context'

const HEAVY_IMPORTS = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import type erasure
  sdk: () => import('@holocronlab/botruntime-sdk') as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import type erasure
  client: () => import('@holocronlab/botruntime-client') as any,
  llmz: async () => {
    const llmz = await import('@holocronlab/botruntime-llmz')
    await llmz.init()
  },
} as const

export const scheduleHeavyImport = (key: keyof typeof HEAVY_IMPORTS) => {
  context.get('scheduledHeavyImports').add(key)
}

export const clearScheduledHeavyImports = () => {
  context.get('scheduledHeavyImports').clear()
}

export const importScheduledHeavyImports = async () => {
  const imports = Array.from(context.get('scheduledHeavyImports'))
  clearScheduledHeavyImports()

  for (const key of imports) {
    try {
      void HEAVY_IMPORTS[key as keyof typeof HEAVY_IMPORTS]?.().catch(() => {
        // Ignore
      })
    } catch {}
  }
}
