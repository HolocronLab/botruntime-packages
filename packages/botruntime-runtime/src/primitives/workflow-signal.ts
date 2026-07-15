const StepSymbol = Symbol.for('StepSignal')

export type StepExecutionSignal = {
  [StepSymbol]: true
}

export function isStepSignal(error: unknown): error is StepExecutionSignal {
  return typeof error === 'object' && error !== null && StepSymbol in error
}

export function createStepSignal(): StepExecutionSignal {
  return {
    [StepSymbol]: true,
  }
}
