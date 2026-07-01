/**
 * @holocronlab/botruntime-api
 *
 * ADR-0005 build-time bootstrap seam: re-exports the upstream opapi
 * definitions pinned to the exact @botpress/api version that produced
 * @botpress/client@1.46.0 (i.e. @botpress/api@1.108.0).
 *
 * This package is a build-time-only dependency: it is used to emit the
 * canonical OpenAPI documents (see ./emit-spec.ts) that downstream
 * botruntime-* packages are generated from. Nothing here ships to end
 * users at runtime.
 */
export { api, runtimeApi, adminApi, filesApi, tablesApi, billingApi } from '@botpress/api'
// Also re-exports the `state` + per-section namespaces (runtime, admin, files, tables, billing)
export * from '@botpress/api'
