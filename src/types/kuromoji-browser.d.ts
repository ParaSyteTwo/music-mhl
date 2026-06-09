interface JapaneseToken {
  surface_form: string
  reading?: string
  pronunciation?: string
}

interface JapaneseTokenizer {
  tokenize(text: string): JapaneseToken[]
}

declare module 'kuromoji/build/kuromoji.js' {
  const kuromoji: {
    builder(options: { dicPath: string }): {
      build(callback: (error: Error | null, tokenizer: JapaneseTokenizer) => void): void
    }
  }

  export default kuromoji
}
