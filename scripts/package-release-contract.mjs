const EXACT_PLATFORM_FIELDS = new Set(['dependencies', 'optionalDependencies'])

export function registrySpecForLocalDependency({ field, dependencyName, siblingVersion }) {
  if (
    EXACT_PLATFORM_FIELDS.has(field) &&
    typeof dependencyName === 'string' &&
    dependencyName.startsWith('@holocronlab/')
  ) {
    return siblingVersion
  }
  return `^${siblingVersion}`
}

export function validateInstalledReleaseTrain(
  dependencyTree,
  expectedVersions,
  { requiredPackages = [] } = {}
) {
  const found = new Set()
  let checkedOccurrences = 0

  function visit(node, path) {
    for (const [name, dependency] of Object.entries(node?.dependencies ?? {})) {
      const dependencyPath = [...path, name]
      if (expectedVersions.has(name)) {
        const expected = expectedVersions.get(name)
        const actual = dependency?.version
        if (actual !== expected) {
          throw new Error(
            `release train mismatch at ${dependencyPath.join(' -> ')}: expected ${expected}, installed ${actual ?? 'unknown'}`
          )
        }
        found.add(name)
        checkedOccurrences++
      }
      visit(dependency, dependencyPath)
    }
  }

  visit(dependencyTree, [])

  for (const name of requiredPackages) {
    if (!found.has(name)) {
      throw new Error(`release train is missing required package ${name}`)
    }
  }

  return { checkedOccurrences, packages: found.size }
}
