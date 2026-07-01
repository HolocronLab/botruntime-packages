/**
 * Shared match utilities for assertion grading.
 * Used by tool, state, and table graders.
 */

import type { MatchOperator } from '../types'

/**
 * Evaluate a single match operator against a value.
 */
export function matchValue(operator: MatchOperator, actual: unknown): boolean {
  // Shorthand: string means exact match
  if (typeof operator === 'string') {
    return String(actual) === operator
  }

  if ('equals' in operator) {
    return actual === operator.equals
  }

  if ('contains' in operator) {
    return String(actual).toLowerCase().includes(operator.contains.toLowerCase())
  }

  if ('not_contains' in operator) {
    return !String(actual).toLowerCase().includes(operator.not_contains.toLowerCase())
  }

  if ('matches' in operator) {
    return new RegExp(operator.matches, 'i').test(String(actual))
  }

  if ('in' in operator) {
    return operator.in.includes(actual)
  }

  if ('exists' in operator) {
    return operator.exists ? actual !== undefined && actual !== null : actual === undefined || actual === null
  }

  if ('gte' in operator) {
    return Number(actual) >= operator.gte
  }

  if ('lte' in operator) {
    return Number(actual) <= operator.lte
  }

  return false
}

export function operatorToString(operator: MatchOperator): string {
  if (typeof operator === 'string') return `equals "${operator}"`
  if ('equals' in operator) return `equals ${JSON.stringify(operator.equals)}`
  if ('contains' in operator) return `contains "${operator.contains}"`
  if ('not_contains' in operator) return `not_contains "${operator.not_contains}"`
  if ('matches' in operator) return `matches /${operator.matches}/`
  if ('in' in operator) return `in [${operator.in.map((v) => JSON.stringify(v)).join(', ')}]`
  if ('exists' in operator) return operator.exists ? 'exists' : 'does not exist'
  if ('gte' in operator) return `>= ${operator.gte}`
  if ('lte' in operator) return `<= ${operator.lte}`
  return JSON.stringify(operator)
}
