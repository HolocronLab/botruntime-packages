import { AdkError } from '@holocronlab/botruntime-analytics'

// .refine()/.transform()/.superRefine() produce a ZodEffects that can't serialize
// to JSON Schema at the platform boundary. Run the conversion through here so the
// failure names the offending primitive instead of leaking the raw Zui message.
export function serializeSchema<T>(primitive: string, serialize: () => T): T {
  try {
    return serialize()
  } catch (error) {
    if (error instanceof Error && /cannot be transformed to JSON Schema/i.test(error.message)) {
      throw new AdkError({
        code: 'SCHEMA_NOT_SERIALIZABLE',
        message: `${primitive} schema can't be serialized to JSON Schema (it uses .refine()/.transform()/.superRefine()).`,
        expected: true,
        suggestion:
          'Remove .refine()/.transform()/.superRefine() from the schema and validate inside the handler instead.',
        cause: error,
      })
    }
    throw error
  }
}
