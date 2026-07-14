// Megaplan APIv3 entity types + serialization helpers. Ported 1:1 from the Go
// client (main:api/internal/clients/megaplan/types.go). Donor invariants are kept
// as WHY-comments — they encode live-probe gotchas, not narration.

// contentType discriminators of APIv3 entities.
export const ContentType = {
  Deal: 'Deal',
  Program: 'Program',
  ProgramState: 'ProgramState',
  Employee: 'Employee',
  ContractorHuman: 'ContractorHuman',
  ContractorCompany: 'ContractorCompany',
  Comment: 'Comment',
  File: 'File',
  Todo: 'Todo',
  Task: 'Task',
  NegotiationItem: 'NegotiationItem',
  NegotiationItemVersion: 'NegotiationItemVersion',
  DateTime: 'DateTime',
  DateOnly: 'DateOnly',
  ContactInfo: 'ContactInfo',
  Money: 'Money',
  // typeTodoFinish — the ONLY finish action of a checklist todo; the body shape
  // is fixed by schema (TodoFinishActionRequest), a string `action` is rejected.
  TodoFinishActionRequest: 'TodoFinishActionRequest',
} as const

// Task lifecycle actions (POST /task/{id}/doAction): assigned -> accepted -> completed.
export const TaskAction = {
  Accept: 'act_accept_task',
  Done: 'act_done',
} as const
export type TaskActionName = (typeof TaskAction)[keyof typeof TaskAction]

// ContactInfo.type values from the APIv3 schema.
export const ContactType = {
  Phone: 'phone',
  Email: 'email',
  Telegram: 'telegram',
} as const
export type ContactTypeName = (typeof ContactType)[keyof typeof ContactType]

export const CommentOwner = {
  Deal: 'deal',
  Contractor: 'contractor',
  Task: 'task',
} as const
export type CommentOwnerName = (typeof CommentOwner)[keyof typeof CommentOwner]

// Ref — APIv3 link entity: contentType + id is enough to reference any object.
export type Ref = { contentType: string; id: string }

export type ContactInfo = {
  contentType?: string
  type: string
  value: string
  comment?: string
}

export type ContractorHuman = {
  contentType: string
  id: string
  name?: string
  firstName?: string
  middleName?: string
  lastName?: string
  description?: string
  contactInfo?: ContactInfo[]
}

// Contractor — element of the generic /contractor list: a mix of humans and
// companies, told apart by contentType.
export type Contractor = {
  contentType: string
  id: string
  name?: string
  firstName?: string
  lastName?: string
  contactInfo?: ContactInfo[]
}

export type ProgramState = {
  contentType?: string
  id: string
  name?: string
  // Type: active | positive | negative — outcome class of the stage.
  type?: string
  isEntry?: boolean
}

export type Program = { contentType?: string; id: string; name?: string }

export type Deal = {
  contentType?: string
  id: string
  name?: string
  number?: string
  description?: string
  program?: Ref
  contractor?: Ref
  manager?: Ref
  state?: ProgramState
  price?: ResponseMoney
  // possibleTransitions — stage moves available from the current state (present
  // only in GET /deal/{id}). Kept as raw objects: the nested transition carries
  // account-specific fields (color, entryPointName, reasons…) and applyTransition
  // wants it VERBATIM — a typed rebuild would drop them.
  possibleTransitions?: unknown[]
}

// ResponseMoney — money as it comes BACK from the API: value is a JSON number
// (and there is no float-precision contract on read, only on write — see Money).
export type ResponseMoney = { value: number | string; currency: string; valueInMain?: number | string; rate?: number }

export type Comment = { contentType?: string; id: string; content?: string }
export type Todo = { contentType?: string; id: string; name?: string }
export type FileRef = { contentType?: string; id: string; path?: string; name?: string; fileName?: string }
export type EmployeeRef = Ref & { name?: string }
export type NegotiationVisa = {
  id?: string
  status?: 'ok' | 'bad' | 'not_rated'
  comment?: Comment
  timeCreated?: string
  userCreated?: EmployeeRef
}
export type NegotiationItemVersion = {
  contentType?: string
  id?: string
  text?: string
  status?: 'ok' | 'bad' | 'not_rated'
  attache?: FileRef
  visas?: NegotiationVisa[]
}
export type NegotiationItem = {
  contentType?: string
  id?: string
  actualVersion?: NegotiationItemVersion
  versions?: NegotiationItemVersion[]
}
export type Task = {
  contentType?: string
  id: string
  name?: string
  status?: string
  isNegotiation?: boolean
  negotiationItems?: NegotiationItem[]
}

// Money — APIv3 money. value is held as a DECIMAL STRING (CLAUDE.md: money is
// computed in code; a JS float would drift). encodeBody() emits it as a raw JSON
// number token; valueInMain + rate are required by the schema, and the bot works
// in the account main currency (RUB) so valueInMain = value, rate = 1.
const DECIMAL_RE = /^-?\d+(\.\d+)?$/
export class Money {
  readonly value: string
  readonly currency: string
  constructor(value: string, currency = 'RUB') {
    if (!DECIMAL_RE.test(value)) {
      throw new Error(`megaplan: Money value must be a decimal string, got ${JSON.stringify(value)}`)
    }
    this.value = value
    this.currency = currency
  }
}

// DateTime — APIv3 moment: {"contentType":"DateTime","value":"YYYY-MM-DD HH:MM:SS"}
// (space, not ISO-T). Held as the already-formatted string to avoid timezone drift
// (the caller/calc decides the wall-clock value).
const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
export class DateTime {
  readonly value: string
  constructor(value: string) {
    if (!DATETIME_RE.test(value)) {
      throw new Error(`megaplan: DateTime must be "YYYY-MM-DD HH:MM:SS", got ${JSON.stringify(value)}`)
    }
    this.value = value
  }
}

const DATEONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
export class DateOnly {
  readonly year: number
  readonly month: number
  readonly day: number
  constructor(value: string) {
    const match = DATEONLY_RE.exec(value)
    if (match === null) {
      throw new Error(`megaplan: DateOnly must be "YYYY-MM-DD", got ${JSON.stringify(value)}`)
    }
    const year = Number(match[1])
    const monthOneBased = Number(match[2])
    const day = Number(match[3])
    const check = new Date(Date.UTC(year, monthOneBased - 1, day))
    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== monthOneBased - 1 ||
      check.getUTCDate() !== day
    ) {
      throw new Error(`megaplan: DateOnly must be a valid date, got ${JSON.stringify(value)}`)
    }
    this.year = year
    this.month = monthOneBased - 1
    this.day = day
  }
}

const SENTINEL = (i: number) => `@@MEGAPLAN_DECIMAL_${i}@@`
const SENTINEL_RE = /"@@MEGAPLAN_DECIMAL_(\d+)@@"/g

// encodeBody serializes a request body, injecting contentType-bearing shapes for
// Money/DateTime/DateOnly. Money.value/valueInMain are emitted as raw JSON NUMBER tokens
// straight from the decimal string (a quoted sentinel is swapped for the literal)
// — JSON.stringify on a JS number would reintroduce float drift.
export function encodeBody(body: unknown): string {
  const decimals: string[] = []
  const json = JSON.stringify(body, (_key, value) => {
    if (value instanceof Money) {
      const i = decimals.length
      decimals.push(value.value)
      return { contentType: ContentType.Money, value: SENTINEL(i), currency: value.currency, valueInMain: SENTINEL(i), rate: 1 }
    }
    if (value instanceof DateTime) {
      return { contentType: ContentType.DateTime, value: value.value }
    }
    if (value instanceof DateOnly) {
      return { contentType: ContentType.DateOnly, year: value.year, month: value.month, day: value.day }
    }
    return value
  })
  return json.replace(SENTINEL_RE, (_m, idx) => decimals[Number(idx)] as string)
}

// selectTransition picks the transition from deal.possibleTransitions leading to
// toStateId and returns its RAW object for verbatim posting to applyTransition.
// null => no such transition (deal already at target or unexpected state: the
// caller treats it as a no-op). Direct `state` writes are silently ignored by the
// API; only applyTransition moves the deal, and only the untouched nested object
// preserves the account-specific fields.
export function selectTransition(transitions: unknown[] | undefined, toStateId: string): unknown | null {
  for (const t of transitions ?? []) {
    const to = (t as { to?: { id?: unknown } })?.to?.id
    if (to != null && String(to) === toStateId) {
      return t
    }
  }
  return null
}

export type FieldError = { field?: string; message: string }

// ApiError carries the HTTP status typed so callers tell a permanent misconfig
// (fail fast) from a transient failure (retry). Only field+message are exposed:
// meta.errors[].type/internalType are Symfony class names and .trace is an
// encrypted blob — neither is ever surfaced.
export class ApiError extends Error {
  readonly status: number
  readonly errors: FieldError[]
  constructor(status: number, errors: FieldError[]) {
    super(ApiError.format(status, errors))
    this.name = 'MegaplanApiError'
    this.status = status
    this.errors = errors
  }
  private static format(status: number, errors: FieldError[]): string {
    if (errors.length === 0) {
      return `megaplan: HTTP ${status}`
    }
    const parts = errors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message))
    return `megaplan: HTTP ${status}: ${parts.join('; ')}`
  }
}
