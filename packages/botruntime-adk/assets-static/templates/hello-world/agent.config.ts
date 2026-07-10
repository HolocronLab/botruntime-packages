import { defineConfig, z } from '@holocronlab/botruntime-runtime'

export default defineConfig({
  name: '{{projectName}}',
  description: 'A Holocron greeting agent',
  defaultModels: {
    autonomous: 'cerebras:gpt-oss-120b',
    zai: 'cerebras:gpt-oss-120b',
  },
  bot: { state: z.object({}) },
  user: { state: z.object({}) },
})
