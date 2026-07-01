import type { Client } from '@holocronlab/botruntime-client'
import type { BotClient } from '@holocronlab/botruntime-sdk/dist/bot'
import { ulid } from 'ulid'
import {
  LifecycleNudgeEvent,
  LifecycleExpireEvent,
  type LifecycleState,
  type LifecycleNudgePayload,
  type LifecycleExpirePayload,
} from '../runtime/events'
import type { LifecycleConfig } from './conversation'
import type { TrackedState } from '../runtime/tracked-state'

/**
 * Context passed to LifecycleEngine methods.
 * Provides access to the client, conversation ID, lifecycle configuration,
 * and the tracked lifecycle state for reading/writing session data.
 */
export type LifecycleEngineContext = {
  /** BotClient for API calls (createEvent, listWorkflows) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: BotClient<any>
  /** The conversation ID */
  conversationId: string
  /** Parsed lifecycle configuration (durations in ms) */
  lifecycleConfig: LifecycleConfig
  /** TrackedState for __lifecycle namespace */
  lifecycleState: TrackedState
  /** The incoming event (for nudge/expire, contains payload with scheduledAt) */
  event?: { type: string; payload: Record<string, unknown> } | undefined
}

type OnNudgeResult = {
  skipped: boolean
  reason?: 'race_guard' | 'workflow_active'
}

type OnExpireResult = {
  skipped: boolean
  reason?: 'race_guard'
}

/**
 * The LifecycleEngine is the heartbeat of the conversation lifecycle system.
 * It manages timer scheduling, cancellation, race guards, and workflow suppression.
 *
 * Three main entry points:
 * - `onActivity()` — called on every incoming user message
 * - `onNudge()` — called when a lifecycleNudge event arrives
 * - `onExpire()` — called when a lifecycleExpire event arrives
 */
export const LifecycleEngine = {
  /**
   * Called on every incoming user message when lifecycle is configured.
   * Handles session renewal if expired, resets nudge count, updates lastActivityAt,
   * cancels existing timers, and schedules new nudge/expire events.
   *
   * Returns `{ renewed: true }` if the session was expired and a new session was started.
   * The caller should use this to clear the sessionExpired conversation tag.
   */
  /**
   * Synchronous part of onActivity — updates session state in memory.
   * Returns immediately so the handler is not blocked on API calls.
   * Call `scheduleTimers()` separately as fire-and-forget for the async work.
   */
  onActivity(ctx: LifecycleEngineContext): { renewed: boolean } {
    const state = ctx.lifecycleState.value as LifecycleState
    const now = new Date().toISOString()

    // Session renewal: if the session was expired, start a fresh session
    if (state.status === 'expired') {
      state.sessionId = ulid()
      state.sessionNumber += 1
      state.nudgeCount = 0
      state.status = 'active'
      state.startedAt = now
      state.lastActivityAt = now
      state.scheduledNudgeEventId = undefined
      state.scheduledExpireEventId = undefined
      ctx.lifecycleState.markDirty()
      return { renewed: true }
    }

    // Normal activity update for active sessions
    state.lastActivityAt = now
    state.nudgeCount = 0
    ctx.lifecycleState.markDirty()
    return { renewed: false }
  },

  /**
   * Async timer management — cancel old timers, schedule new ones.
   * Designed to run as fire-and-forget (not awaited before the handler).
   * Must complete before saveAllDirty() runs at the end of the request.
   */
  async scheduleTimers(ctx: LifecycleEngineContext): Promise<void> {
    const state = ctx.lifecycleState.value as LifecycleState

    // Cancel existing scheduled events
    if (state.scheduledNudgeEventId) {
      await cancelScheduledEventSafely(ctx.client, state.scheduledNudgeEventId)
      state.scheduledNudgeEventId = undefined
    }
    if (state.scheduledExpireEventId) {
      await cancelScheduledEventSafely(ctx.client, state.scheduledExpireEventId)
      state.scheduledExpireEventId = undefined
    }

    // Schedule new events
    if (ctx.lifecycleConfig.nudge) {
      const eventId = await scheduleLifecycleEvent(ctx, 'nudge', ctx.lifecycleConfig.nudge.afterMs)
      if (eventId) {
        state.scheduledNudgeEventId = eventId
      }
    }
    if (ctx.lifecycleConfig.expire) {
      const eventId = await scheduleLifecycleEvent(ctx, 'expire', ctx.lifecycleConfig.expire.afterMs)
      if (eventId) {
        state.scheduledExpireEventId = eventId
      }
    }

    ctx.lifecycleState.markDirty()
  },

  /**
   * Called when a lifecycleNudge event arrives.
   * Performs race guard check, workflow suppression check,
   * and increments nudge count if not skipped.
   *
   * Returns `{ skipped: true }` if the nudge should be silently dropped.
   * The caller dispatches to the user's handler only when `skipped === false`.
   */
  async onNudge(ctx: LifecycleEngineContext): Promise<OnNudgeResult> {
    const state = ctx.lifecycleState.value as LifecycleState
    const payload = ctx.event?.payload as LifecycleNudgePayload | undefined

    // Race guard: if a message arrived after this nudge was scheduled, skip
    if (payload?.scheduledAt && state.lastActivityAt > payload.scheduledAt) {
      return { skipped: true, reason: 'race_guard' }
    }

    // Workflow suppression: if any active workflows exist, reschedule and skip
    const hasActiveWorkflows = await checkActiveWorkflows(ctx)
    if (hasActiveWorkflows) {
      // Reschedule the nudge at the interval delay (not the initial afterMs)
      if (ctx.lifecycleConfig.nudge) {
        const eventId = await scheduleLifecycleEvent(ctx, 'nudge', ctx.lifecycleConfig.nudge.intervalMs)
        if (eventId) {
          state.scheduledNudgeEventId = eventId
          ctx.lifecycleState.markDirty()
        }
      }
      return { skipped: true, reason: 'workflow_active' }
    }

    // Increment nudge count
    state.nudgeCount += 1
    ctx.lifecycleState.markDirty()

    return { skipped: false }
  },

  /**
   * Called after the user's nudge handler has run.
   * Schedules the next nudge if nudgeCount < max (or no max configured).
   */
  async afterNudgeHandler(ctx: LifecycleEngineContext): Promise<void> {
    const state = ctx.lifecycleState.value as LifecycleState
    const nudgeConfig = ctx.lifecycleConfig.nudge

    if (!nudgeConfig) {
      return
    }

    // Schedule next nudge if count is below max (or no max set)
    if (nudgeConfig.max === undefined || state.nudgeCount < nudgeConfig.max) {
      const eventId = await scheduleLifecycleEvent(ctx, 'nudge', nudgeConfig.intervalMs)
      if (eventId) {
        state.scheduledNudgeEventId = eventId
        ctx.lifecycleState.markDirty()
      }
    }
  },

  /**
   * Called when a lifecycleExpire event arrives.
   * Performs race guard check.
   *
   * Returns `{ skipped: true }` if the expire should be silently dropped.
   * The caller dispatches to the user's expire handler only when `skipped === false`.
   * After the handler runs, the caller calls `executeExpiration()`.
   */
  async onExpire(ctx: LifecycleEngineContext): Promise<OnExpireResult> {
    const state = ctx.lifecycleState.value as LifecycleState
    const payload = ctx.event?.payload as LifecycleExpirePayload | undefined

    // Race guard: if a message arrived after this expire was scheduled, skip
    if (payload?.scheduledAt && state.lastActivityAt > payload.scheduledAt) {
      return { skipped: true, reason: 'race_guard' }
    }

    return { skipped: false }
  },

  /**
   * Called after the user's expire handler has run.
   * Performs the hard-kill expiration sequence (strict ordering per institutional learning):
   *
   * 1. Cancel all active workflows on the conversation
   * 2. Update lifecycle state: set status='expired', clear scheduled event IDs
   *
   * Steps 2-4 of the full expiration (tag conversation, reset user state, clear transcript)
   * are handled by the caller in conversation.ts since it has direct access to those objects.
   */
  async executeExpiration(ctx: LifecycleEngineContext): Promise<void> {
    const state = ctx.lifecycleState.value as LifecycleState

    // Step 1: Cancel all active workflows on the conversation
    await cancelAllActiveWorkflows(ctx)

    // Cancel any pending scheduled nudge event before clearing the ID
    if (state.scheduledNudgeEventId) {
      await cancelScheduledEventSafely(ctx.client, state.scheduledNudgeEventId)
    }

    // Step 5: Update lifecycle state
    state.status = 'expired'
    state.scheduledNudgeEventId = undefined
    state.scheduledExpireEventId = undefined
    ctx.lifecycleState.markDirty()
  },
}

/**
 * Cancel a scheduled event by ID. Catches and ignores errors gracefully
 * since the event may have already fired or been processed.
 */
async function cancelScheduledEventSafely(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: BotClient<any>,
  eventId: string
): Promise<void> {
  try {
    // cancelScheduledEvent is only on the raw Client, not BotClient
    const rawClient = client._inner as unknown as Client
    await rawClient.cancelScheduledEvent({ id: eventId })
  } catch {
    // Event may have already fired or been processed — not fatal
  }
}

/**
 * Schedule a lifecycle event (nudge or expire) with the specified delay.
 * Returns the event ID on success, or undefined if scheduling fails.
 */
async function scheduleLifecycleEvent(
  ctx: LifecycleEngineContext,
  type: 'nudge' | 'expire',
  delayMs: number
): Promise<string | undefined> {
  const state = ctx.lifecycleState.value as LifecycleState
  const eventDef = type === 'nudge' ? LifecycleNudgeEvent : LifecycleExpireEvent

  try {
    const { event } = await ctx.client.createEvent({
      type: eventDef.name,
      conversationId: ctx.conversationId,
      payload: {
        conversationId: ctx.conversationId,
        sessionId: state.sessionId,
        scheduledAt: new Date().toISOString(),
      },
      schedule: {
        delay: delayMs,
      },
    })

    return event.id
  } catch (err) {
    // Scheduling failure means timers won't fire this cycle.
    // Next message will retry scheduling. Log but don't crash.
    console.warn(
      `[lifecycle] Failed to schedule ${type} event for conversation ${ctx.conversationId}:`,
      err instanceof Error ? err.message : String(err)
    )
    return undefined
  }
}

/**
 * Check if any active workflows exist for the conversation.
 * Used for nudge suppression — nudges should not fire during active workflows.
 *
 * Returns true if active workflows exist, false otherwise.
 * On error, returns true (suppress nudge — fail-closed is safer than firing during unknown workflow state).
 */
async function checkActiveWorkflows(ctx: LifecycleEngineContext): Promise<boolean> {
  try {
    // Use the raw client for listWorkflows since BotClient's version requires a name parameter
    const rawClient = ctx.client._inner as unknown as Client
    const { workflows } = await rawClient.listWorkflows({
      conversationId: ctx.conversationId,
      statuses: ['pending', 'in_progress', 'listening', 'paused'],
    })
    return workflows.length > 0
  } catch {
    // Fail-closed: suppress nudge when workflow status is unknown
    console.warn('[lifecycle] Failed to check active workflows, suppressing nudge (fail-closed)')
    return true
  }
}

/**
 * Cancel all active workflows for the conversation during expiration.
 * Queries for workflows in active statuses and cancels each individually.
 *
 * Error handling: catches per-workflow errors and continues cancelling others.
 * A single workflow cancellation failure should not abort the expiration sequence.
 */
async function cancelAllActiveWorkflows(ctx: LifecycleEngineContext): Promise<void> {
  try {
    const rawClient = ctx.client._inner as unknown as Client
    const { workflows } = await rawClient.listWorkflows({
      conversationId: ctx.conversationId,
      statuses: ['pending', 'in_progress', 'listening', 'paused'],
    })

    if (workflows.length === 0) {
      return
    }

    // Cancel each workflow individually, catching per-workflow errors
    await Promise.allSettled(
      workflows.map(async (workflow) => {
        try {
          await rawClient.updateWorkflow({
            id: workflow.id,
            status: 'cancelled',
          })
        } catch (err) {
          console.warn(
            `[lifecycle] Failed to cancel workflow ${workflow.id} during expiration for conversation ${ctx.conversationId}:`,
            err instanceof Error ? err.message : String(err)
          )
        }
      })
    )
  } catch (err) {
    // If the list query itself fails, log and continue with the rest of the expiration
    console.warn(
      `[lifecycle] Failed to list workflows for cancellation during expiration for conversation ${ctx.conversationId}:`,
      err instanceof Error ? err.message : String(err)
    )
  }
}
