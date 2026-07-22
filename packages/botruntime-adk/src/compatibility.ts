// The ADK generator layout and brt orchestration are a versioned contract.
// Keep this range narrow enough that a future layout change cannot silently
// produce files in a path the CLI does not build.
export const BRT_COMPATIBILITY_RANGE = '>=0.7.0 <0.10.0'
