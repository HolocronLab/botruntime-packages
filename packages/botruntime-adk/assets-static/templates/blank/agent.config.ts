import { defineConfig, z } from '@holocronlab/botruntime-runtime'

export default defineConfig({
  name: '{{projectName}}',
  description: 'A Holocron agent',
  bot: { state: z.object({}) },
  user: { state: z.object({}) },
})
