import { dereference } from '@apidevtools/json-schema-ref-parser'
import * as sdk from '@holocronlab/botruntime-sdk'
import { JSONSchema7 } from 'json-schema'

type ZuiToJsonSchema = typeof sdk.z.transforms.toJSONSchemaLegacy
type JsonSchema = ReturnType<ZuiToJsonSchema>

type SchemaOptions = {
  title?: string
  examples?: any[]
}

type SchemaDefinition = {
  schema: sdk.z.ZuiObjectOrRefSchema
  ui?: Record<string, SchemaOptions | undefined>
}

type MapSchemaOptions = {
  useLegacyZuiTransformer?: boolean
  toJSONSchemaOptions?: Partial<sdk.z.transforms.JSONSchemaGenerationOptions>
}

const isObjectSchema = (schema: JsonSchema): boolean => schema.type === 'object'

type ExtendedJsonSchema = JSONSchema7 & {
  'x-zui'?: Record<string, unknown>
  'x-botruntime-fileRef'?: {
    version: 'v1'
    mode: 'exact' | 'resolve-current'
  }
}

const FILE_REF_METADATA_KEY = 'botruntimeFileRef'

const liftFileRefAdmissionAnnotations = (value: unknown): void => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return
  const schema = value as ExtendedJsonSchema
  const marker = schema['x-zui']?.[FILE_REF_METADATA_KEY]
  if (marker !== undefined) {
    if (
      typeof marker !== 'object'
      || marker === null
      || Array.isArray(marker)
      || !('version' in marker)
      || marker.version !== 'v1'
      || !('mode' in marker)
      || (marker.mode !== 'exact' && marker.mode !== 'resolve-current')
      || Object.keys(marker).some((key) => key !== 'version' && key !== 'mode')
    ) {
      throw new TypeError('Invalid botruntime FileRef admission metadata')
    }
    schema['x-botruntime-fileRef'] = {
      version: 'v1',
      mode: marker.mode,
    }
    const nextMetadata = { ...schema['x-zui'] }
    delete nextMetadata[FILE_REF_METADATA_KEY]
    if (Object.keys(nextMetadata).length === 0) {
      delete schema['x-zui']
    } else {
      schema['x-zui'] = nextMetadata
    }
  }

  if (schema.properties) {
    for (const child of Object.values(schema.properties)) liftFileRefAdmissionAnnotations(child)
  }
  if (schema.items) {
    if (Array.isArray(schema.items)) {
      for (const child of schema.items) liftFileRefAdmissionAnnotations(child)
    } else {
      liftFileRefAdmissionAnnotations(schema.items)
    }
  }
  for (const name of ['oneOf', 'anyOf', 'allOf'] as const) {
    for (const child of schema[name] ?? []) liftFileRefAdmissionAnnotations(child)
  }
}

export async function mapZodToJsonSchema(
  definition: SchemaDefinition,
  options: MapSchemaOptions
): Promise<ReturnType<typeof sdk.z.transforms.toJSONSchemaLegacy>> {
  let schema: JSONSchema7
  if (options.useLegacyZuiTransformer) {
    schema = sdk.z.transforms.toJSONSchemaLegacy(definition.schema, {
      target: 'jsonSchema7',
      ...options.toJSONSchemaOptions,
    })
  } else {
    schema = sdk.z.transforms.toJSONSchema(definition.schema, options.toJSONSchemaOptions)
  }
  schema = (await dereferenceSchema(schema)) as typeof schema
  liftFileRefAdmissionAnnotations(schema)

  if (!isObjectSchema(schema) || !definition.ui) {
    return schema
  }

  for (const [key, value] of Object.entries(definition.ui ?? {})) {
    const property = schema.properties?.[key]

    if (!property) {
      continue
    }

    if (!!value?.title) {
      ;(property as any).title = value.title
    }

    if (!!value?.examples) {
      ;(property as any).examples = value.examples
    }
  }

  return schema
}

export const dereferenceSchema = async (schema: JSONSchema7): Promise<JSONSchema7> => {
  return dereference(schema, {
    resolve: {
      external: false,
      file: false,
      http: false,
    },
  })
}
