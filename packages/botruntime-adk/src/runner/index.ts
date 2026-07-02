/**
 * ADK Script Runner
 *
 * Provides functionality to run TypeScript scripts with the full ADK runtime
 * initialized. This is useful for:
 * - Running table migrations
 * - Ad-hoc operations requiring an instantiated client
 * - Running tests (bun test) with programmatic API
 */
export { ScriptRunner, runScript, setupTestRuntime } from './script-runner.js'
export type {
  ScriptRunnerOptions,
  RunScriptOptions,
  ScriptRunnerCredentials,
  RunOptions,
  TestRuntimeResult,
  SetupTestRuntimeOptions,
} from './script-runner.js'
