import { getSingleton } from './singletons'

type InterfaceName = string
type IntegrationName = string
type InterfaceAction = string
type IntegrationAction = string

export type IntegrationInterfaceMappings = {
  [Interface in InterfaceName]: {
    actions: Record<`${IntegrationName}:${InterfaceAction}`, `${IntegrationName}:${IntegrationAction}`>
  }
}

class InterfaceMappings {
  private mappings: IntegrationInterfaceMappings = {}

  public registerMappings(mappings: IntegrationInterfaceMappings) {
    this.mappings = { ...this.mappings, ...mappings }
  }

  public getIntegrationAction(
    interfaceName: InterfaceName,
    actionName: InterfaceAction,
    integrationName: IntegrationName
  ): string | undefined {
    return this.mappings[interfaceName]?.actions[`${integrationName}:${actionName}`]
  }
}

export const interfaceMappings = getSingleton('__ADK_GLOBAL_INTERFACE_MAPPINGS', () => new InterfaceMappings())
