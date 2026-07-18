// Shared STRICT changeset-frontmatter parser for both the CI gate
// (changeset-lint.mjs) and the release script (changeset-version.mjs). Kept in
// one place so a malformed pending changeset fails the PR gate now — loudly,
// with a pointer to the bad line — instead of only surfacing later when a
// maintainer runs changeset-version.mjs to cut a release.
const FRONTMATTER_BLOCK = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/
const FRONTMATTER_LINE = /^"([^"]+)":\s*(patch|minor|major)\s*$/

export function parseChangesetFile(content) {
  const match = FRONTMATTER_BLOCK.exec(content)
  if (!match) throw new Error('changeset file is missing --- frontmatter')
  const [, frontmatter, body] = match
  const bumps = new Map()
  for (const line of frontmatter.split('\n')) {
    if (!line.trim()) continue
    const lineMatch = FRONTMATTER_LINE.exec(line)
    if (!lineMatch) throw new Error(`invalid changeset frontmatter line: ${JSON.stringify(line)}`)
    bumps.set(lineMatch[1], lineMatch[2])
  }
  // The gate exists to guarantee a consumer-facing note (DEVLP-174 review
  // round 2): an empty/whitespace-only body would render as a bare "- "
  // bullet in the generated CHANGELOG, which is worse than no entry at all —
  // it looks like documentation without saying anything.
  const summary = body.trim()
  if (!summary) throw new Error('changeset body must not be empty — describe the consumer-facing change')
  return { bumps, summary }
}
