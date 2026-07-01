import type { Client as BotpressClient } from '@holocronlab/botruntime-client'
import { client } from './client'

export type TrackAnalyticsInput = Parameters<BotpressClient['trackAnalytics']>[0]
export type TrackAnalyticsResponse = Awaited<ReturnType<BotpressClient['trackAnalytics']>>

export function trackAnalytics(name: string, count?: number): Promise<TrackAnalyticsResponse>
export function trackAnalytics(input: TrackAnalyticsInput): Promise<TrackAnalyticsResponse>
export function trackAnalytics(nameOrInput: string | TrackAnalyticsInput, count = 1): Promise<TrackAnalyticsResponse> {
  return client.trackAnalytics(typeof nameOrInput === 'string' ? { name: nameOrInput, count } : nameOrInput)
}

export const analytics = {
  track: trackAnalytics,
}
