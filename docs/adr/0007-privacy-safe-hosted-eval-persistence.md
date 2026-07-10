# ADR-0007: privacy-safe persistence for hosted evals

Status: Accepted (2026-07-10)
Branch: `fork-botpress-deps`

## Context

Eval execution naturally handles the most sensitive material in an agent system:
user messages, bot responses, judge prompts, expected and actual values, tool
arguments, state snapshots, traces, and raw errors. Persisting a local eval report is
useful during development, but copying that report wholesale into the managed control
plane would turn an operational feature into a second transcript and trace store.

The platform needs enough hosted state to answer operational questions — what ran,
which eval and assertion category passed, how long it took, whether execution failed,
and whether a run was aborted — without retaining conversation content. It also needs
a lifecycle that remains correct when a workflow retries after a timeout or loses a
response after the server has already committed a write.

## Decision

### Two deliberately different persistence tiers

Local development keeps the rich report locally. The local eval store may contain the
messages, responses, expected and actual values, and diagnostic detail needed to debug
an eval. This data does not become the managed-cloud persistence format.

Hosted persistence is metadata-only by schema. The managed database and write DTOs
contain safe identifiers, closed enums, booleans, bounded scores and durations, and
timestamps. They do **not** contain descriptions, messages, responses, prompts, tool
arguments or outputs, state, evidence, arbitrary metadata/JSON, grader names, or raw
error text. Errors cross the boundary only as a closed `errorKind`:

`aborted | configuration | auth | trace_reader | chat | timeout | upstream | internal`.

Assertion results cross it only as a closed `assertionKind`, `passed`, the required
`skipped` bit, and optional bounded numeric measurements. Privacy is therefore a
property of the storage schema and DTO decoder, not a convention callers must remember.

### Bot-scoped authority only

Hosted eval routes use the runtime bot-auth chain. In production, a bot API key is
already scoped to one owner, workspace, and bot. In development, a PAT must additionally
carry the opaque runtime `x-bot-id`, which the server resolves inside the authenticated
workspace. The `botId` path segment on create/list is only an exact selector check
against that canonical runtime identity.

Workspace IDs, arbitrary target bot IDs, and metadata supplied in request bodies are
never authority. They are rejected rather than ignored. Human/admin trace access stays
on its separate route and credential model.

### Explicit, retry-safe lifecycle

A hosted run follows one explicit state machine:

1. Filter and validate definitions, capabilities, and trace-reader access **before**
   creating a visible run.
2. Create the run with an explicit `evalManifestId`, `workflowId`, and trigger type.
3. Start each eval entry, append one turn's safe result batch at a time, and finalize
   the entry with its verdict.
4. Replay the complete safe projection as a required final reconciliation.
5. Complete the run only after every entry is terminal.

Every write is idempotent under its natural key. An exact replay returns success and
the same ID or `{ok:true}`, including after an entry or run is terminal. A divergent
replay returns `409`; terminal rows are otherwise immutable. This makes workflow-step
retries safe without making conflicting histories silently converge.

Live-ingest failures are not logged and swallowed. The runtime retains exact completed
reports in memory, replays those reports unchanged, and synthesizes only missing entries
with a typed execution failure. On a partial abort, already completed entries retain
their own verdict/error kind; only missing entries and the run terminal receive
`aborted`. If reconciliation or terminalization fails, that failure is surfaced.

A failed assertion is a valid completed eval result and does not make execution fail.
Only a typed execution error or abort moves the run to execution-failed state.

### Bounds and retention

The API and database enforce bounded identifiers, request bodies, pagination, entries,
turns, per-turn results, total results, scores, and durations. The runtime mirrors the
hosted limits and rejects an invalid projection before `createRun`, preventing orphaned
runs that could never be persisted.

Hosted eval metadata has a 30-day **logical** retention ceiling. `expiresAt` is
server-controlled and constrained by the database to no later than `createdAt + 30 days`;
callers cannot extend it through request data. As soon as a run expires, every active
read, list, and lifecycle lock excludes it. A create retry may remove the expired row in
the same authenticated scope before reusing its `workflowId`. The API therefore stops
exposing metadata at the deadline even if physical cleanup has not run yet.

Physical deletion is asynchronous on a five-minute cadence. A CloudAPI-enabled app runs
the reaper once at startup and then every five minutes. Each pass drains expired runs in
5,000-row `FOR UPDATE SKIP LOCKED` batches, so multiple replicas cooperate without
blocking one another; database cascades remove entries and results with each run. Locks,
backlog, or repeated database errors can delay physical deletion, but never restore API
visibility after logical expiry. The manual maintenance command remains an explicitly
gated dry-run/emergency/backfill tool and may shorten retention. It is not the normal
mechanism that makes 30-day-old data logically unavailable.

## Product status

This decision establishes an **internal platform foundation**, not a public hosted-eval
product. The runtime and cloud API lifecycle exist so the control plane can be built on
a safe contract. As of this ADR, there is no public `brt eval` command, public scheduler,
or generally available hosted eval dashboard. Documentation must not present those
surfaces as available. ADR-0006 Phase 3 remains future work.

Until those surfaces ship, developers run rich eval workflows locally. Managed-cloud
documentation may describe the privacy and architectural contract, but must label the
hosted capability as unavailable/internal rather than provide fictional setup steps.

## Consequences

- A database dump of hosted evals cannot reveal conversation or prompt content.
- Hosted history can support trends, pass/fail counts, latency, skipped judges, and
  typed operational failures, but it cannot reconstruct a rich failure transcript.
- Deep debugging remains a local workflow (or uses separately governed trace tooling);
  the hosted eval store is intentionally not a transcript archive.
- Client and server must evolve the closed enums and limits together. Unknown write
  fields fail closed, and contract tests use canary secrets to prevent accidental drift.
- Final reconciliation adds duplicate requests, but exact-replay idempotency makes that
  cost predictable and closes partial-ingest gaps.
- The 30-day promise is an exact API-visibility boundary, not an exact physical-delete
  timestamp. Expired rows may remain physically present for the bounded reaper delay,
  while all product reads already treat them as absent.
- Periodic cleanup is safe under multiple app replicas and bounded per transaction; the
  manual command is reserved for emergency cleanup, backfill, or operator-requested
  shortening.

## Source-of-truth implementation

- Package client and projection:
  `packages/botruntime-evals/src/stores/vortex-eval-store.ts`
- Runtime lifecycle and failure reconciliation:
  `packages/botruntime-runtime/src/runtime/workflows/hosted-eval-lifecycle.ts`
- Runtime workflow boundary:
  `packages/botruntime-runtime/src/runtime/workflows/eval-runner.ts`
- Cloud DTO/auth/lifecycle:
  `botforge/api/internal/cloudapi/handlers_evals.go` and
  `botforge/api/internal/cloudapi/eval_store.go`
- Database schema and retention ceiling:
  `botforge/api/migrations/0072_eval_store.sql` and
  `botforge/api/migrations/0073_eval_retention_ceiling.sql`
- Logical expiry and bounded physical reaping:
  `botforge/api/internal/cloudapi/eval_store.go` and `botforge/api/internal/app/app.go`
- Manual emergency/backfill/shortening path:
  `botforge/api/cmd/trace-maintenance`
