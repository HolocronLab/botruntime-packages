import { WellKnownAttributes } from './well-known-attributes'

export type RequiredWellKnownAttributes = {
  [K in keyof typeof WellKnownAttributes]: Omit<(typeof WellKnownAttributes)[K], 'required'> & { required: true }
}

export const required = <T extends keyof typeof WellKnownAttributes>(
  ...keys: T[]
): Pick<RequiredWellKnownAttributes, T> => {
  const result: Partial<typeof WellKnownAttributes> = {}
  for (const key of keys) {
    result[key] = { ...WellKnownAttributes[key], required: true }
  }
  return result as Pick<RequiredWellKnownAttributes, T>
}

export const optional = <T extends keyof typeof WellKnownAttributes>(
  ...keys: T[]
): Pick<typeof WellKnownAttributes, T> => {
  const result: Partial<typeof WellKnownAttributes> = {}
  for (const key of keys) {
    result[key] = { ...WellKnownAttributes[key], required: true }
  }
  return result as Pick<typeof WellKnownAttributes, T>
}

export type AttributeType = 'string' | 'enum' | 'number' | 'boolean' | 'object' | 'date' | 'json'

export type AttributeDefinition<T extends AttributeType = AttributeType, Enum = ReadonlyArray<string>> = {
  type: T
  enum?: Enum
  title?: string
  description?: string
  required?: boolean
  default?: TypeForAttribute<T, Enum>
}

export type SpanDefinition = {
  name: string
  importance: 'debug' | 'low' | 'medium' | 'high'
  attributes: Record<string, AttributeDefinition>
}

/**
 * Type representing valid span importance levels
 */
export type SpanImportanceLevel = SpanDefinition['importance']

export type TypeForAttribute<T extends AttributeType, Enum = ReadonlyArray<string>> = T extends 'string'
  ? string
  : T extends 'enum'
    ? Enum extends ReadonlyArray<string>
      ? Enum[number]
      : never
    : T extends 'number'
      ? number
      : T extends 'boolean'
        ? boolean
        : T extends 'object'
          ? Record<string, unknown>
          : T extends 'date'
            ? Date
            : T extends 'json'
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- json can be any value
                any
              : never

export type GetSpanType<T extends SpanDefinition> = {
  name: T['name']
  attributes: {
    -readonly [K in keyof T['attributes'] as T['attributes'][K] extends {
      required: true
    }
      ? K
      : never]: TypeForAttribute<T['attributes'][K]['type'], T['attributes'][K] extends { enum: infer E } ? E : never>
  } & {
    -readonly [K in keyof T['attributes'] as T['attributes'][K] extends {
      required: true
    }
      ? never
      : K]?:
      | TypeForAttribute<T['attributes'][K]['type'], T['attributes'][K] extends { enum: infer E } ? E : never>
      | undefined
  }
}
