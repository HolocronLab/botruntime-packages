import { BUILTIN_INTERFACES } from '../../constants.js'

export interface InterfaceInfo {
  alias: string
  name: string
  version: string
  builtin: boolean
}

export class InterfaceRegistry {
  async list(): Promise<InterfaceInfo[]> {
    return Object.entries(BUILTIN_INTERFACES).map(([alias, versionString]) => {
      const [name, version] = versionString.split('@')
      return { alias, name: name || alias, version: version || 'latest', builtin: true }
    })
  }

  async getInfo(alias: string): Promise<InterfaceInfo | undefined> {
    const all = await this.list()
    return all.find((i) => i.alias === alias)
  }
}
