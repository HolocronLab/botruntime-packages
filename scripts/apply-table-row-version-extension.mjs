#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const rowVersionSchema = {
  type: 'integer',
  minimum: 1,
  description: 'System-managed optimistic concurrency token for the row.',
}

function insertPropertyAfter(properties, after, name, schema) {
  if (properties[name]) return properties

  const extended = {}
  for (const [key, value] of Object.entries(properties)) {
    extended[key] = value
    if (key === after) extended[name] = schema
  }
  if (!extended[name]) extended[name] = schema
  return extended
}

export function extendOpenApiDocument(document) {
  const schemas = document?.components?.schemas
  const row = schemas?.Row
  if (row?.properties) {
    row.properties = insertPropertyAfter(row.properties, 'id', 'rowVersion', rowVersionSchema)
    if (Array.isArray(row.required) && !row.required.includes('rowVersion')) {
      const idIndex = row.required.indexOf('id')
      row.required.splice(idIndex >= 0 ? idIndex + 1 : row.required.length, 0, 'rowVersion')
    }
  }

  const requestBodies = document?.components?.requestBodies
  for (const bodyName of ['updateTableRowsBody', 'upsertTableRowsBody']) {
    const itemSchema = requestBodies?.[bodyName]?.content?.['application/json']?.schema?.properties?.rows?.items
    if (itemSchema?.properties) {
      itemSchema.properties = insertPropertyAfter(itemSchema.properties, 'id', 'rowVersion', rowVersionSchema)
    }
  }

  return document
}

export function extendGeneratedClientSource(source, { requestRowVersion = false } = {}) {
  const responsePattern = /(\n(?<indent>\s*)id: number;\n)(?<next>\s*\/\*\*\n\s*\* Timestamp of row creation\.)/g
  let output = source.replace(responsePattern, (...args) => {
    const [, idLine, , next] = args
    const groups = args.at(-1)
    const indent = typeof groups === 'object' && groups !== null ? groups.indent : ''
    return `${idLine}${indent}/**\n${indent} * System-managed optimistic concurrency token for the row.\n${indent} */\n${indent}rowVersion: number;\n${next}`
  })

  if (requestRowVersion) {
    const requestPattern = /(\n(?<indent>\s*)id\??: number;\n)(?<next>\s*\[k: string\]: any;)/g
    output = output.replace(requestPattern, (...args) => {
      const [, idLine, , next] = args
      const groups = args.at(-1)
      const indent = typeof groups === 'object' && groups !== null ? groups.indent : ''
      return `${idLine}${indent}/**\n${indent} * Expected row version for optimistic concurrency control.\n${indent} */\n${indent}rowVersion?: number;\n${next}`
    })
  }

  return output
}

function patchOpenApiFiles() {
  const directory = join(root, 'packages/botruntime-api/openapi')
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
    const path = join(directory, file)
    const document = JSON.parse(readFileSync(path, 'utf8'))
    extendOpenApiDocument(document)
    writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`)
  }
}

function patchClientFiles() {
  for (const section of ['public', 'tables']) {
    const operations = join(root, 'packages/botruntime-client/src/gen', section, 'operations')
    for (const operation of [
      'getTableRow.ts',
      'findTableRows.ts',
      'createTableRows.ts',
      'updateTableRows.ts',
      'upsertTableRows.ts',
    ]) {
      const path = join(operations, operation)
      if (!existsSync(path)) continue
      const source = readFileSync(path, 'utf8')
      const extended = extendGeneratedClientSource(source, {
        requestRowVersion: operation === 'updateTableRows.ts' || operation === 'upsertTableRows.ts',
      })
      if (!extended.includes('rowVersion')) throw new Error(`failed to extend generated client file: ${path}`)
      writeFileSync(path, extended)
    }

    const modelsPath = join(root, 'packages/botruntime-client/src/gen', section, 'models.ts')
    if (existsSync(modelsPath)) {
      const source = readFileSync(modelsPath, 'utf8')
      const extended = extendGeneratedClientSource(source)
      if (!extended.includes('rowVersion')) throw new Error(`failed to extend generated client models: ${modelsPath}`)
      writeFileSync(modelsPath, extended)
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  patchOpenApiFiles()
  patchClientFiles()
  console.log('[row-version-extension] extended OpenAPI and generated TypeScript client artifacts')
}
