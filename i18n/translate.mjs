// English overlay: swaps Japanese UI text for English at load time so the
// upstream source stays untouched (keeps `git merge upstream/main` clean).
// Dictionary: i18n/en.json  ({ "<Japanese segment>": "<English>" }).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const DICT_PATH = join(ROOT, 'i18n', 'en.json')

export const JP_RE = /[　-ヿ一-鿿＀-￯]/
// Characters that delimit string literals / JSX text, so a segment never spans them.
const DELIM_RE = /['"`<>{}]/
const COMMENT_LINE_RE = /^\s*(\/\/|\*|\/\*|\{\s*\/\*)/

let cache = null
function loadPairs() {
  if (cache) return cache
  let dict = {}
  try {
    dict = JSON.parse(readFileSync(DICT_PATH, 'utf8'))
  } catch {
    dict = {}
  }
  // Longest first so a phrase wins over a shorter phrase it contains.
  cache = Object.entries(dict)
    .filter(([k, v]) => k && typeof v === 'string')
    .sort((a, b) => b[0].length - a[0].length)
  return cache
}

/** Whether a source file should be translated (app code, not tests). */
export function shouldTranslate(path) {
  const rel = relative(ROOT, path).split(sep).join('/')
  if (!/\.(ts|tsx|mts)$/.test(rel)) return false
  if (rel.includes('node_modules/') || rel.startsWith('i18n/')) return false
  if (/\.test\.|\/test\//.test(rel)) return false
  return /^(src|server|cli)\//.test(rel)
}

export function translateSource(code) {
  if (!JP_RE.test(code)) return code
  let out = code
  for (const [ja, en] of loadPairs()) {
    if (out.includes(ja)) out = out.split(ja).join(en)
  }
  return out
}

/** Japanese segments of one source file, split on literal/JSX delimiters. */
export function extractSegments(code) {
  const segs = new Set()
  for (const line of code.split(/\r?\n/)) {
    if (!JP_RE.test(line) || COMMENT_LINE_RE.test(line)) continue
    for (const piece of line.split(DELIM_RE)) {
      // Drop a trailing `// comment` outside the literal.
      const cleaned = piece.replace(/\s\/\/\s.*$/, '').trim()
      if (JP_RE.test(cleaned)) segs.add(cleaned)
    }
  }
  return segs
}

export function walkSourceFiles(dir = ROOT, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkSourceFiles(p, acc)
    else if (shouldTranslate(p)) acc.push(p)
  }
  return acc
}
