import * as fs from 'fs'
import { describe, expect, it } from 'vitest'
import { ProjectTemplates } from './project-templates'

describe('ProjectTemplates', () => {
  it('only declares project types that brt init actually reads from this table (bot generates via ADK instead)', () => {
    expect(Object.keys(ProjectTemplates.templates).sort()).toEqual(['integration', 'plugin'])
  })

  it('points every declared template at a directory that exists on disk', () => {
    const allTemplates = Object.values(ProjectTemplates.templates).flat()
    expect(allTemplates.length).toBeGreaterThan(0)
    for (const template of allTemplates) {
      expect(fs.existsSync(template.absolutePath), `${template.identifier} -> ${template.absolutePath}`).toBe(true)
    }
  })

  it('exposes a stable, deduplicated identifier list for the --template flag', () => {
    expect(ProjectTemplates.getAllChoices().sort()).toEqual(['empty', 'hello-world', 'webhook-message'])
  })
})
