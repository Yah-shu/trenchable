// Bun runtime plugin: applies the English overlay to server / CLI sources.
// Loaded via bunfig.toml `preload`.
import { plugin } from 'bun'
import { shouldTranslate, translateSource } from './translate.mjs'

plugin({
  name: 'english-overlay',
  setup(build) {
    build.onLoad({ filter: /[\\/](server|src|cli)[\\/].*\.(ts|tsx|mts)$/ }, async (args) => {
      const code = await Bun.file(args.path).text()
      if (!shouldTranslate(args.path)) {
        return { contents: code, loader: args.path.endsWith('x') ? 'tsx' : 'ts' }
      }
      return {
        contents: translateSource(code),
        loader: args.path.endsWith('x') ? 'tsx' : 'ts',
      }
    })
  },
})
