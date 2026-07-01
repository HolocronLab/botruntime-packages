import { getWasmTokenizer, TextTokenizer } from '@holocronlab/botruntime-thicktoken'

let tokenizer: TextTokenizer | null = null

export async function getTokenizer(): Promise<TextTokenizer> {
  if (!tokenizer) {
    while (!getWasmTokenizer) {
      // there's an issue with wasm, it doesn't load immediately
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    tokenizer = (await getWasmTokenizer()) as TextTokenizer
  }
  return tokenizer
}
