
import { AxiosRequestConfig } from "axios"
import qs from "qs"

export type Primitive = string | number | boolean
export type Value<P extends Primitive> = P | P[] | Record<string, P>
export type QueryValue = Value<string> | Value<boolean> | Value<number> | undefined
export type AnyQueryParams = Record<string, QueryValue>
export type HeaderValue = string | undefined
export type AnyHeaderParams = Record<string, HeaderValue>
export type AnyBodyParams = Record<string, any>
export type ParsedRequest = {
  method: string
  path: string
  query: AnyQueryParams
  headers: AnyHeaderParams
  body: AnyBodyParams
}

const isDefined = <T>(pair: [string, T | undefined]): pair is [string, T] => pair[1] !== undefined

export const toAxiosRequest = (req: ParsedRequest): AxiosRequestConfig => {
  const { method, path, query, headers: headerParams, body } = req

  // prepare headers
  const headerEntries: [string, string][] = Object.entries(headerParams).filter(isDefined)
  const headers = Object.fromEntries(headerEntries)

  // prepare query params
  const queryString = qs.stringify(query, { encode: true, arrayFormat: 'repeat', allowDots: true })

  const url = queryString ? [path, queryString].join('?') : path
  const data =
    ['put', 'post', 'delete', 'patch'].includes(method.toLowerCase())
      ? body
      : undefined

  return {
    method,
    url,
    headers,
    data,
  }
}
