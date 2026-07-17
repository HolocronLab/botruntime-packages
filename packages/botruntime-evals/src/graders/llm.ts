/**
 * LLM judge grader using @holocronlab/botruntime-zai.
 * `zai.check` owns the judge prompt, output parsing, and retries on invalid model output.
 */

import type { Client } from '@holocronlab/botruntime-client'
import { Cognitive } from '@holocronlab/botruntime-cognitive'
import { Zai } from '@holocronlab/botruntime-zai'
import type { EvalLogger, GraderResult } from '../types'
import { defaultLogger } from '../types'

const MODEL_ALIASES = ['fast', 'best']

let _zai: Zai | null = null
let _availableModels: string[] = []
let _judgeModel: string = 'fast'
// When true (default), a judge that can't run is a hard FAIL, so an unavailable judge can't be
// mistaken for success. Callers may opt into fail-open (a skipped pass) via `failClosed: false`,
// e.g. local runs without judge credentials. Either way the result is marked `skipped: true`.
let _failClosed: boolean = true
let _log: EvalLogger = defaultLogger

/** @internal Test-only: clears module judge state so tests stay hermetic in the shared bun test process. */
export function _resetLLMJudgeForTests(): void {
  _zai = null
  _availableModels = []
  _judgeModel = 'fast'
  _log = defaultLogger
  _failClosed = true
}

/** @internal Test-only: injects a fake Zai client so judge behavior is testable offline. */
export function _setLLMJudgeForTests(zai: unknown, options?: { failClosed?: boolean; model?: string }): void {
  _zai = zai as Zai
  _availableModels = ['fast']
  _judgeModel = options?.model ?? 'fast'
  _failClosed = options?.failClosed ?? true
}

function _isModelValid(model: string): boolean {
  if (MODEL_ALIASES.includes(model)) return true
  if (_availableModels.length === 0) return false

  return _availableModels.includes(model)
}

/** Initialize the LLM judge with an authenticated Botpress client. */
export async function initLLMJudge(
  client: Client,
  options?: { model?: string; logger?: EvalLogger; failClosed?: boolean }
) {
  const log = options?.logger ?? defaultLogger
  _log = log
  _failClosed = options?.failClosed ?? true

  const cognitive = new Cognitive({ client })

  try {
    _availableModels = Array.from((await cognitive.fetchRemoteModels()).keys())
  } catch (err) {
    log.warn(`Failed to fetch available models: ${(err as Error).message}. LLM judge will be unavailable.`)
    _availableModels = []
  }

  _judgeModel = options?.model ?? 'fast'

  if (_availableModels.length === 0) {
    log.warn('No available Cognitive models: cannot validate judge model.')
  } else if (!_isModelValid(_judgeModel)) {
    log.warn(`Configured LLM judge model "${_judgeModel}" is invalid. Choose a model exposed by the Cognitive API.`)
  }

  _zai = new Zai({ client: cognitive, modelId: _judgeModel as ConstructorParameters<typeof Zai>[0]['modelId'] })
}

export async function gradeLLMJudge(
  botResponse: string,
  criteria: string,
  context: {
    userMessage: string
    /** @deprecated No-op: the judge is boolean (zai.check); there is no score threshold. */
    passThreshold?: number
  }
): Promise<GraderResult> {
  const assertion = `llm_judge: "${criteria}"`

  try {
    if (!_zai) {
      _log.warn(`LLM judge unavailable for "${criteria}": no credentials configured (initLLMJudge not called)`)
      return {
        assertion,
        pass: !_failClosed,
        skipped: true,
        expected: criteria,
        actual: 'FAILED — LLM judge unavailable: no credentials configured',
      }
    }

    if (!_isModelValid(_judgeModel)) {
      return {
        assertion,
        pass: false,
        expected: criteria,
        actual: 'FAILED — invalid LLM judge model',
      }
    }

    const { output } = await _zai.check({ userMessage: context.userMessage, botResponse }, criteria).result()

    return {
      assertion,
      pass: output.value,
      expected: criteria,
      actual: `${output.value ? 'Pass' : 'Fail'} — ${output.explanation}`,
    }
  } catch (err) {
    _log.warn(`LLM judge failed for "${criteria}": ${(err as Error).message}`)
    return {
      assertion,
      pass: !_failClosed,
      skipped: true,
      expected: criteria,
      actual: `FAILED — LLM judge unavailable: ${(err as Error).message}`,
    }
  }
}
