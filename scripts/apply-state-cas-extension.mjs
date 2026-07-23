#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const stateVersionSchema = {
  type: 'integer',
  minimum: 1,
  description:
    'Opaque optimistic-concurrency token. Present on CAS-capable servers; clients must not derive or increment it.',
}

const expectedVersionSchema = {
  type: 'integer',
  minimum: 0,
  description:
    'Expected opaque state version. Omit for legacy last-write-wins behavior; use 0 only when the state must not exist.',
}

const stateOperationNames = ['GetState', 'SetState', 'PatchState', 'GetOrSetState', 'SetStateExpiry']
const mutatingOperationNames = new Set(['SetState', 'PatchState'])

function insertPropertyAfter(properties, after, name, schema) {
  if (properties[name]) return properties

  const extended = {}
  for (const [key, value] of Object.entries(properties)) {
    extended[key] = value
    if (key === after) extended[name] = structuredClone(schema)
  }
  if (!extended[name]) extended[name] = structuredClone(schema)
  return extended
}

export function extendOpenApiDocument(document) {
  const state = document?.components?.schemas?.State
  if (state?.properties) {
    state.properties = insertPropertyAfter(state.properties, 'updatedAt', 'version', stateVersionSchema)
  }

  const requestBodies = document?.components?.requestBodies
  for (const bodyName of ['setStateBody', 'patchStateBody']) {
    const schema = requestBodies?.[bodyName]?.content?.['application/json']?.schema
    if (schema?.properties) {
      schema.properties = insertPropertyAfter(schema.properties, 'expiry', 'expectedVersion', expectedVersionSchema)
    }
  }

  return document
}

const versionTypeField = `    /**
     * Opaque optimistic-concurrency token. Absent when connected to a legacy server.
     */
    version?: number;
`

const expectedVersionTypeField = `  /**
   * Expected opaque state version. Omit for legacy last-write-wins behavior; use 0 only when the state must not exist.
   */
  expectedVersion?: number;
`

function extendGeneratedStateResponse(source, operationName) {
  const responseStart = source.indexOf(`export interface ${operationName}Response`)
  if (responseStart < 0) throw new Error(`failed to find ${operationName} response`)

  const response = source.slice(responseStart)
  if (response.includes('version?: number;')) return source

  const updatedAtPattern = /(\n    updatedAt: string;\n)/
  if (!updatedAtPattern.test(response)) {
    throw new Error(`failed to find ${operationName} response updatedAt field`)
  }

  return source.slice(0, responseStart) + response.replace(updatedAtPattern, `$1${versionTypeField}`)
}

function extendGeneratedStateRequest(source, operationName) {
  if (!mutatingOperationNames.has(operationName)) return source

  const inputMarker = `\n}\n\nexport type ${operationName}Input`
  const inputBoundary = source.indexOf(inputMarker)
  if (inputBoundary < 0) throw new Error(`failed to find ${operationName} request body boundary`)

  const requestBody = source.slice(0, inputBoundary)
  let output = source
  if (!requestBody.includes('expectedVersion?: number;')) {
    output = output.replace(inputMarker, `\n${expectedVersionTypeField}}\n\nexport type ${operationName}Input`)
  }

  const serializerField = "'expectedVersion': input['expectedVersion']"
  if (!output.includes(serializerField)) {
    const serializerPattern = /(\n\s*body: \{[^\n]*)( \},)/
    if (!serializerPattern.test(output)) {
      throw new Error(`failed to find ${operationName} request serializer boundary`)
    }
    output = output.replace(serializerPattern, `$1, ${serializerField}$2`)
  }

  return output
}

export function extendGeneratedStateOperation(source, operationName) {
  return extendGeneratedStateResponse(extendGeneratedStateRequest(source, operationName), operationName)
}

export function extendGeneratedStateModel(source) {
  const stateStart = source.indexOf('export interface State {')
  if (stateStart < 0) throw new Error('failed to find generated State model')

  const nextInterface = source.indexOf('\nexport interface ', stateStart + 1)
  const stateEnd = nextInterface < 0 ? source.length : nextInterface
  const state = source.slice(stateStart, stateEnd)
  if (state.includes('version?: number;')) return source

  const updatedAtPattern = /(\n  updatedAt: string;\n)/
  if (!updatedAtPattern.test(state)) throw new Error('failed to find generated State.updatedAt field')

  const field = `  /**
   * Opaque optimistic-concurrency token. Absent when connected to a legacy server.
   */
  version?: number;
`
  return source.slice(0, stateStart) + state.replace(updatedAtPattern, `$1${field}`) + source.slice(stateEnd)
}

function patchOpenApiFiles() {
  const directory = join(root, 'packages/botruntime-api/openapi')
  let stateSchemas = 0
  let requestSchemas = 0

  for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
    const path = join(directory, file)
    const document = JSON.parse(readFileSync(path, 'utf8'))
    if (document?.components?.schemas?.State) stateSchemas++
    for (const bodyName of ['setStateBody', 'patchStateBody']) {
      if (document?.components?.requestBodies?.[bodyName]) requestSchemas++
    }
    extendOpenApiDocument(document)
    writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`)
  }

  if (stateSchemas === 0 || requestSchemas === 0) {
    throw new Error('no state response/request schemas found to extend')
  }
}

function patchClientFiles() {
  let operations = 0
  let models = 0

  for (const section of ['public', 'runtime']) {
    for (const operationName of stateOperationNames) {
      const filename = `${operationName.charAt(0).toLowerCase()}${operationName.slice(1)}.ts`
      const path = join(root, 'packages/botruntime-client/src/gen', section, 'operations', filename)
      if (!existsSync(path)) continue
      writeFileSync(path, extendGeneratedStateOperation(readFileSync(path, 'utf8'), operationName))
      operations++
    }

    const modelsPath = join(root, 'packages/botruntime-client/src/gen', section, 'models.ts')
    if (existsSync(modelsPath)) {
      writeFileSync(modelsPath, extendGeneratedStateModel(readFileSync(modelsPath, 'utf8')))
      models++
    }
  }

  if (operations !== stateOperationNames.length * 2 || models !== 2) {
    throw new Error(`incomplete generated state surface: ${operations} operations, ${models} models`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]
  if (mode !== '--client-only') patchOpenApiFiles()
  if (mode !== '--openapi-only') patchClientFiles()
  const target =
    mode === '--openapi-only'
      ? 'OpenAPI schemas'
      : mode === '--client-only'
        ? 'generated clients'
        : 'OpenAPI schemas and generated clients'
  console.log(`[state-cas-extension] extended ${target}`)
}
