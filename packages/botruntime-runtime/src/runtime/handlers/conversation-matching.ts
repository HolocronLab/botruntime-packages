/**
 * Utility functions for matching conversation handlers to channels
 */

export type ConversationHandler = {
  channel: string | string[] | '*'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- index signature for flexible handler types
  [key: string]: any
}

/**
 * Check if a handler's channel specification matches an incoming channel
 */
export function matchesChannel(handlerChannel: string | string[] | '*', incomingChannel: string): boolean {
  if (handlerChannel === '*') {
    return true // Glob matches all channels
  } else if (Array.isArray(handlerChannel)) {
    return handlerChannel.includes(incomingChannel) // Check if channel is in array
  } else {
    return handlerChannel === incomingChannel // Exact match
  }
}

/**
 * Find the most specific matching handler for a given channel
 * Prioritization: single channel > array > glob (*)
 */
export function findMatchingHandler<T extends ConversationHandler>(
  handlers: T[],
  incomingChannel: string
): T | undefined {
  // Filter to only matching handlers
  const matchingHandlers = handlers.filter((h) => matchesChannel(h.channel, incomingChannel))

  // Sort by specificity: single (most specific) > array > glob (least specific)
  return matchingHandlers.sort((a, b) => {
    const aScore = a.channel === '*' ? 0 : Array.isArray(a.channel) ? 1 : 2
    const bScore = b.channel === '*' ? 0 : Array.isArray(b.channel) ? 1 : 2
    return bScore - aScore // Higher score = more specific
  })[0]
}
