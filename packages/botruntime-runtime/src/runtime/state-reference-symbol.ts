/**
 * Symbol for objects that can be serialized as state references
 *
 * Objects implementing this symbol should return a serializable reference object
 * when this symbol method is called.
 *
 * @example
 * class MyObject {
 *   [StateReference]() {
 *     return { __ref__: 'myobject', id: this.id }
 *   }
 * }
 *
 * @internal
 */
export const StateReference = Symbol.for('state.reference')

/**
 * Interface for objects that can be referenced in state
 */
export interface StateReferenceable {
  [StateReference]: () => {
    __ref__: string
    id: string
    [key: string]: unknown
  }
}
