import type { AgentProject } from '../agent-project/agent-project.js'
import { generateTableTypes } from './table-types.js'
import { generateStateTypes } from './state-types.js'
import { generateConfigurationTypes } from './configuration-types.js'
import { generateSecretTypes } from './secret-types.js'
import { generateWorkflowTypes } from './workflow-types.js'
import { generateComponentTypes } from './component-types.js'
import { generateTagTypes } from './tag-types.js'
import { generateActionTypes } from './action-types.js'

// Type files derived purely from agent source (no integration resolution); safe offline.
// Shared by local generation and readiness validation so their type output cannot drift.
export async function generateLocalTypes(project: AgentProject): Promise<void> {
  await generateTableTypes(project)
  await generateStateTypes(project)
  await generateConfigurationTypes(project)
  await generateSecretTypes(project)
  await generateWorkflowTypes(project)
  await generateComponentTypes(project)
  await generateTagTypes(project)
  await generateActionTypes(project)
}
