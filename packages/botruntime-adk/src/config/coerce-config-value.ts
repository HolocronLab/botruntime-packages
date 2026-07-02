import type { z } from '@holocronlab/botruntime-sdk'

/**
 * Coerce a string value from CLI/terminal input to the type expected by a Zod field schema.
 *
 * CLI arguments and text inputs are always strings, but config schemas may expect
 * numbers, booleans, etc. This function inspects the Zod schema's type and converts
 * the raw string accordingly.
 *
 * Returns the coerced value, or the original string if the type is unknown or unsupported
 * (letting Zod validation catch any remaining mismatches).
 */
export function coerceConfigValue(value: string, fieldSchema: z.ZodTypeAny): unknown {
  const typeName = getInnerTypeName(fieldSchema)

  switch (typeName) {
    case 'ZodNumber': {
      const num = Number(value)
      if (Number.isNaN(num)) {
        return value
      }
      return num
    }

    case 'ZodBoolean': {
      const lower = value.toLowerCase()
      if (lower === 'true' || lower === '1' || lower === 'yes') {
        return true
      }
      if (lower === 'false' || lower === '0' || lower === 'no') {
        return false
      }
      return value
    }

    default:
      return value
  }
}

/**
 * Unwrap optional/default/nullable wrappers to get the inner type name.
 * e.g. z.number().optional() has typeName 'ZodOptional' but the inner type is 'ZodNumber'.
 */
export function getInnerTypeName(schema: z.ZodTypeAny): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing internal Zod _def property
  const def = (schema as any)?._def
  if (!def) {
    return 'unknown'
  }

  const typeName: string = def.typeName ?? 'unknown'

  if ((typeName === 'ZodOptional' || typeName === 'ZodNullable' || typeName === 'ZodDefault') && def.innerType) {
    return getInnerTypeName(def.innerType)
  }

  return typeName
}
