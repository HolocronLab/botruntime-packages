import * as consts from './consts'
import * as utils from './utils'

export namespace ProjectTemplates {
  export type Template = Readonly<{
    fullName: string
    identifier: string
    defaultProjectName: string
    absolutePath: utils.path.AbsolutePath
  }>
  export type TemplateArray = Readonly<[Template, ...Template[]]>
  // 'bot' is excluded: bot init doesn't read this table at all — it generates
  // an ADK project in-process via AgentProjectGenerator (see init-command.ts
  // _initBot), keyed by its own 'blank'/'hello-world' template names. A
  // scaffold-copy 'bot' entry here would be unreachable dead code (was:
  // templates/empty-bot, the pre-ADK-collapse Botpress-native bot template).
  export type ProjectType = 'plugin' | 'integration'

  const _dirNameToAbsPath = (directoryName: string) => utils.path.join(consts.cliRootDir, 'templates', directoryName)

  export const templates = {
    plugin: [
      {
        fullName: 'Empty Plugin',
        identifier: 'empty',
        defaultProjectName: 'empty-plugin',
        absolutePath: _dirNameToAbsPath('empty-plugin'),
      },
    ],
    integration: [
      {
        fullName: 'Empty Integration',
        identifier: 'empty',
        defaultProjectName: 'empty-integration',
        absolutePath: _dirNameToAbsPath('empty-integration'),
      },
      {
        fullName: 'Hello World',
        identifier: 'hello-world',
        defaultProjectName: 'hello-world',
        absolutePath: _dirNameToAbsPath('hello-world'),
      },
      {
        fullName: 'Webhook Message',
        identifier: 'webhook-message',
        defaultProjectName: 'webhook-message',
        absolutePath: _dirNameToAbsPath('webhook-message'),
      },
    ],
  } as const satisfies { [k in ProjectType]: TemplateArray }

  export const getAllChoices = () => [...new Set(Object.values(templates).flatMap((t) => t.map((tt) => tt.identifier)))]
}
