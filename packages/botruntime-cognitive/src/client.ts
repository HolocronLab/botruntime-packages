import { createNanoEvents, Unsubscribe } from 'nanoevents'

import { ExtendedClient, getExtendedClient } from './bp-client'
import { CognitiveBeta, getCognitiveV2Model, buildResponseFromBetaMetadata } from './cognitive-v2'

import { InterceptorManager } from './interceptors'
import { Model, ModelRef } from './models'
import { CognitiveProps, Events, InputProps, Request, Response } from './types'

export class Cognitive {
  public ['$$IS_COGNITIVE'] = true

  public static isCognitiveClient(obj: any): obj is Cognitive {
    return obj?.$$IS_COGNITIVE === true
  }

  public interceptors = {
    request: new InterceptorManager<Request>(),
    response: new InterceptorManager<Response>(),
  }

  protected _timeoutMs: number = 5 * 60 * 1000 // Default timeout of 5 minutes
  protected _client: ExtendedClient
  protected _debug = false
  private _remoteModelCache = new Map<string, Model>()
  private _remoteModelCacheTime = 0
  private _remoteModelCachePending: Promise<Map<string, Model>> | null = null

  private _events = createNanoEvents<Events>()

  public constructor(props: CognitiveProps) {
    this._client = getExtendedClient(props.client)
    this._timeoutMs = props.timeout ?? this._timeoutMs
    this._debug = props.__debug ?? false
  }

  public get client(): ExtendedClient {
    return this._client
  }

  public clone(): Cognitive {
    const copy = new Cognitive({
      client: this._client.clone(),
      timeout: this._timeoutMs,
      __debug: this._debug,
    })

    copy._remoteModelCache = new Map(this._remoteModelCache)
    copy._remoteModelCacheTime = this._remoteModelCacheTime
    copy._remoteModelCachePending = null

    copy.interceptors.request = this.interceptors.request
    copy.interceptors.response = this.interceptors.response

    return copy
  }

  public on<K extends keyof Events>(this: this, event: K, cb: Events[K]): Unsubscribe {
    return this._events.on(event, cb)
  }

  public async fetchRemoteModels(): Promise<Map<string, Model>> {
    if (this._remoteModelCacheTime > 0 && Date.now() - this._remoteModelCacheTime < 60 * 60 * 1000) {
      return this._remoteModelCache
    }

    if (this._remoteModelCachePending !== null) {
      return this._remoteModelCachePending
    }

    this._remoteModelCachePending = this._doFetchRemoteModels().finally(() => {
      this._remoteModelCachePending = null
    })

    return this._remoteModelCachePending
  }

  private async _doFetchRemoteModels(): Promise<Map<string, Model>> {
    const betaClient = new CognitiveBeta(this._client.config)
    const remoteModels = await betaClient.listModels()

    this._remoteModelCache.clear()
    this._remoteModelCacheTime = Date.now()

    for (const m of remoteModels) {
      const converted: Model = { ...m, ref: m.id as ModelRef, integration: 'cognitive-v2' }
      this._remoteModelCache.set(m.id, converted)

      if (m.aliases) {
        for (const alias of m.aliases) {
          this._remoteModelCache.set(alias, converted)
        }
      }
    }

    return this._remoteModelCache
  }

  public async getModelDetails(model: string): Promise<Model> {
    const resolvedModel = getCognitiveV2Model(model)
    if (resolvedModel) {
      return { ...resolvedModel, ref: resolvedModel.id as ModelRef, integration: 'cognitive-v2' }
    }

    try {
      const found = (await this.fetchRemoteModels()).get(model)
      if (found) return found
    } catch {
      // Generation surfaces the authoritative v2 error. Model inspection stays
      // permissive so a newly published model does not require an SDK release.
    }

    return {
      id: model,
      ref: model as ModelRef,
      integration: 'cognitive-v2',
      name: model,
      description: '',
      tags: [],
      input: { maxTokens: 128_000, costPer1MTokens: 0 },
      output: { maxTokens: 8_192, costPer1MTokens: 0 },
    } as Model
  }

  public async generateContent(input: InputProps): Promise<Response> {
    return this._generateContentV2(input)
  }

  private async _generateContentV2(input: InputProps): Promise<Response> {
    const signal = input.signal ?? AbortSignal.timeout(this._timeoutMs)
    const props = await this.interceptors.request.run({ input }, signal)
    const v2Input = { ...props.input, messages: [...props.input.messages] }
    if (v2Input.systemPrompt) {
      // @ts-expect-error - system role is not supported in the integrations api, but is used in v2
      v2Input.messages.unshift({ role: 'system', content: v2Input.systemPrompt })
      delete v2Input.systemPrompt
    }

    const betaClient = new CognitiveBeta(this._client.config)
    // Forward beta client events to main client events
    betaClient.on('request', () => {
      this._events.emit('request', props)
    })

    betaClient.on('error', (_req, error) => {
      this._events.emit('error', props, error)
    })

    betaClient.on('retry', (_req, error) => {
      this._events.emit('retry', props, error)
    })

    const response = await betaClient.generateText(v2Input as any, {
      signal,
      timeout: this._timeoutMs,
    })

    // Shared with the beta adapter (cognitiveFromBeta) so the Cognitive wrapper
    // and a standalone CognitiveBeta produce an identical `Response` shape.
    const result = await this.interceptors.response.run(
      buildResponseFromBetaMetadata(response.output, response.metadata),
      signal
    )

    // Emit final response event with actual data
    this._events.emit('response', props, result)

    return result
  }

}
