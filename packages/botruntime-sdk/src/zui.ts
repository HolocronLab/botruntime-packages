import '@holocronlab/botruntime-zui'

declare module '@holocronlab/botruntime-zui' {
  export namespace z {
    export type GenericZuiSchema<
      A extends Record<string, z.ZodType> = Record<string, z.ZodType>,
      R extends z.ZodType = z.ZodType,
    > = (typeArguments: A) => R

    export type ZuiObjectSchema = z.ZodObject | z.ZodRecord
    export type ZuiObjectOrRefSchema = ZuiObjectSchema | z.ZodRef
  }
}

export { z } from '@holocronlab/botruntime-zui'
