import { shouldTranslate, translateSource } from './translate.mjs'

/** Vite plugin: applies the English overlay to the web UI sources. */
export function englishOverlay() {
  return {
    name: 'english-overlay',
    enforce: 'pre',
    transformIndexHtml(html) {
      return html.replace('<html lang="ja">', '<html lang="en">')
    },
    transform(code, id) {
      const path = id.split('?')[0]
      if (!shouldTranslate(path)) return null
      let out = translateSource(code)
      // Local theme layer (Plinth, which imports theme/plinth.css for the fonts, tokens
      // and base), loaded after the upstream stylesheet. Applies always.
      if (/[\\/]src[\\/]main\.tsx$/.test(path)) {
        out = out.replace("import './index.css'", "import './index.css'\nimport '../theme/plinth-kie.css'")
      }
      return out === code ? null : { code: out, map: null }
    },
  }
}
