/**
 * State assertion graders.
 * Pure functions that grade state assertions against StateMutation[] from the transformer.
 * No API calls, no retries, no BpClient.
 */

import type { StateMutation, StateAssertion, GraderResult } from '../types'

/**
 * Parse a state path like "conversation.lastCity" into its components.
 *   bot.*            -> type: "bot",          field: "*"
 *   user.*           -> type: "user",         field: "*"
 *   conversation.*   -> type: "conversation", field: "*"
 */
function parseStatePath(path: string): { type: string; field: string } {
  const dot = path.indexOf('.')
  if (dot === -1) {
    throw new Error(`Invalid state path "${path}" — expected "type.field" format`)
  }

  const type = path.slice(0, dot)
  const field = path.slice(dot + 1)

  if (type !== 'bot' && type !== 'user' && type !== 'conversation') {
    throw new Error(`Unknown state type "${type}" in path "${path}" — expected bot, user, or conversation`)
  }

  return { type, field }
}

/**
 * Grade state assertions using StateMutation[] from the transformer.
 *
 * - `equals`: find the LAST mutation matching the state type, extract field from `current`, deep-compare
 * - `changed: true`: check if the field appears in ANY mutation's `changedKeys` for that state type
 * - `changed: false`: check that the field appears in NO mutation's `changedKeys`
 * - Swapped state: when `swappedToFile` is true, current/previous are undefined — report a clear message
 */
export function gradeState(mutations: StateMutation[], assertions: StateAssertion[]): GraderResult[] {
  const results: GraderResult[] = []

  for (const assertion of assertions) {
    const parsed = parseStatePath(assertion.path)
    const matchingMutations = mutations.filter((m) => m.type === parsed.type)

    if (assertion.equals !== undefined) {
      if (matchingMutations.length === 0) {
        results.push({
          assertion: `state: ${assertion.path} equals`,
          pass: false,
          expected: JSON.stringify(assertion.equals),
          actual:
            `No state.save span found for "${parsed.type}" — the bot did not mutate this state during the turn. ` +
            'If this state was seeded via setup.state, assert on the tool/action that reads it, or use a conversation turn that triggers a state write.',
        })
        continue
      }

      const lastMutation = matchingMutations[matchingMutations.length - 1]!

      if (lastMutation.swappedToFile) {
        results.push({
          assertion: `state: ${assertion.path} equals`,
          pass: false,
          expected: JSON.stringify(assertion.equals),
          actual: 'State was too large for trace-based assertion (swapped to file)',
        })
        continue
      }

      const currentState = lastMutation.current as Record<string, unknown> | undefined
      const actualValue = currentState ? currentState[parsed.field] : undefined
      const pass = deepEqual(actualValue, assertion.equals)

      results.push({
        assertion: `state: ${assertion.path} equals`,
        pass,
        expected: JSON.stringify(assertion.equals),
        actual: JSON.stringify(actualValue),
      })
    }

    if (assertion.changed !== undefined) {
      if (matchingMutations.length === 0) {
        results.push({
          assertion: `state: ${assertion.path} ${assertion.changed ? 'changed' : 'unchanged'}`,
          pass: !assertion.changed,
          expected: assertion.changed
            ? `Field "${parsed.field}" changed in a "${parsed.type}" state mutation`
            : `Field "${parsed.field}" unchanged`,
          actual: 'No state mutation found for type "' + parsed.type + '"',
        })
        continue
      }

      // Check for swapped state in any matching mutation
      const hasSwapped = matchingMutations.some((m) => m.swappedToFile)
      if (hasSwapped) {
        results.push({
          assertion: `state: ${assertion.path} ${assertion.changed ? 'changed' : 'unchanged'}`,
          pass: false,
          expected: assertion.changed
            ? `Field "${parsed.field}" changed in a "${parsed.type}" state mutation`
            : `Field "${parsed.field}" unchanged`,
          actual: 'State was too large for trace-based assertion (swapped to file)',
        })
        continue
      }

      const fieldChanged = matchingMutations.some((m) => m.changedKeys.includes(parsed.field))
      const pass = assertion.changed ? fieldChanged : !fieldChanged

      results.push({
        assertion: `state: ${assertion.path} ${assertion.changed ? 'changed' : 'unchanged'}`,
        pass,
        expected: assertion.changed
          ? `Field "${parsed.field}" changed in a "${parsed.type}" state mutation`
          : `Field "${parsed.field}" unchanged`,
        actual: fieldChanged ? `Field "${parsed.field}" was changed` : `Field "${parsed.field}" was not changed`,
      })
    }
  }

  return results
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as object)
    const keysB = Object.keys(b as object)
    if (keysA.length !== keysB.length) return false
    return keysA.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }

  return false
}
