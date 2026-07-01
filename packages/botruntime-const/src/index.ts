/**
 * Minimal, faithful reimplementation of the handful of symbols brt needs
 * from `@bpinternal/const`: `prefixToObjectMap` and `FileId` (from
 * `./prefixes`) and `limitConfigs` (from `./limits`). The upstream package
 * additionally ships ~40 files of internal Botpress billing configuration
 * (plans, meters, addons, quotas, etc.) that brt never uses.
 */
export * from './prefixes'
export * from './limits'
