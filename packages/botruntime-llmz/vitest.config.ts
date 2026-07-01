import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.utils.test.ts', '**/e2e/**'],
    passWithNoTests: true,
    testTimeout: 10_000,
    setupFiles: './vitest.setup.ts',
    snapshotSerializers: ['./vitest.stack-trace-serializer.ts'],
    snapshotEnvironment: './vitest.snapshot.ts',
  },
})
