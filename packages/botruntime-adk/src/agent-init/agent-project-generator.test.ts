import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const templatesRoot = path.join(packageRoot, 'assets-static', 'templates')
const generatorUrl = pathToFileURL(path.join(packageRoot, 'src', 'agent-init', 'agent-project-generator.ts')).href
const brtVersion = (
  JSON.parse(readFileSync(path.resolve(packageRoot, '../brt/package.json'), 'utf8')) as { version: string }
).version
const generatedProjects: string[] = []

afterEach(() => {
  for (const projectPath of generatedProjects.splice(0)) {
    rmSync(projectPath, { recursive: true, force: true })
  }
})

describe('AgentProjectGenerator static templates', () => {
  it('registers only the supported starter templates', () => {
    const registry = JSON.parse(readFileSync(path.join(templatesRoot, 'template.config.json'), 'utf8')) as {
      templates: Array<{ name: string }>
    }
    expect(registry.templates.map(({ name }) => name)).toEqual(['blank', 'hello-world'])
  })

  it.each(['blank', 'hello-world'])('generates a runnable %s project with the brt script contract', async (template) => {
    const projectPath = mkdtempSync(path.join(packageRoot, `.template-smoke-${template}-`))
    generatedProjects.push(projectPath)
    const script = `
      globalThis.__BP_CLI_VERSION__ = ${JSON.stringify(brtVersion)};
      const { AgentProjectGenerator } = await import(${JSON.stringify(generatorUrl)});
      AgentProjectGenerator.setTemplatesRoot(${JSON.stringify(templatesRoot)});
      await new AgentProjectGenerator(${JSON.stringify(projectPath)}, 'bun', ${JSON.stringify(template)}).generate();
    `
    execFileSync('bun', ['--eval', script], { cwd: packageRoot })

    const packageJson = JSON.parse(readFileSync(path.join(projectPath, 'package.json'), 'utf8')) as {
      description: string
      scripts: Record<string, string>
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    const config = readFileSync(path.join(projectPath, 'agent.config.ts'), 'utf8')
    const readme = readFileSync(path.join(projectPath, 'README.md'), 'utf8')

    expect(packageJson.description).toContain('Holocron')
    expect(packageJson.scripts).toEqual({
      dev: 'brt dev',
      'dev:check': 'brt dev --check',
      typecheck: 'tsc --noEmit',
      deploy: 'brt deploy --adk',
    })
    expect(packageJson.dependencies).toHaveProperty('@holocronlab/botruntime-runtime')
    expect(packageJson.devDependencies).toHaveProperty('@holocronlab/brt', `^${brtVersion}`)
    expect(config).toMatch(/from ["']@holocronlab\/botruntime-runtime["']/)
    expect(readme).toContain('brt dev')
    expect(readme).toContain('brt deploy --adk')
    execFileSync(
      path.join(packageRoot, 'node_modules', '.bin', 'tsc'),
      ['--project', path.join(projectPath, 'tsconfig.json'), '--noEmit'],
      { cwd: projectPath }
    )
  })
})
