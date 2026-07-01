import stringify from 'fast-safe-stringify'
import { AttributeValue } from '@opentelemetry/api'
import { isNil, isNumber, isObjectLike } from 'lodash'
import { inspectToJsonSize } from '../utilities/strings'

export const truncateAttribute = <T>(value: T, maxLength = 1024): AttributeValue => {
  if (Array.isArray(value)) {
    return JSON.parse(stringify(value.map((v) => truncateAttribute(v))))
  }

  if (isObjectLike(value)) {
    return inspectToJsonSize(value, { maxBytes: maxLength })
  }

  if (isNumber(value) || typeof value === 'boolean') {
    return value
  }

  if (isNil(value)) {
    return String(value)
  }

  if (typeof value !== 'string') {
    throw new Error(`Unsupported attribute type: ${typeof value}`)
  }

  if (value.length > maxLength) {
    return value.slice(0, maxLength) + '...(truncated)'
  }

  return value
}
