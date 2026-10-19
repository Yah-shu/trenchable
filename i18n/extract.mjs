// Lists Japanese segments that en.json does not cover yet.
//   node i18n/extract.mjs            -> summary + writes i18n/missing.json
//   node i18n/extract.mjs --check    -> exit 1 if anything is missing
import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  DICT_PATH,
  JP_RE,
  ROOT,
  extractSegments,
  translateSource,
  walkSourceFiles,
} from './translate.mjs'

const dict = JSON.parse(readFileSync(DICT_PATH, 'utf8'))
const missing = {}
for (const file of walkSourceFiles()) {
  const code = readFileSync(file, 'utf8')
  // Segments still Japanese after the current dictionary is applied.
  for (const seg of extractSegments(translateSource(code))) {
    if (dict[seg] !== undefined) continue
    ;(missing[seg] ??= []).push(relative(ROOT, file))
  }
}

// Values are spliced into string literals: no delimiters, no Japanese, and a
// trailing `\` or `$` (escape / template marker) must survive.
const bad = Object.entries(dict).filter(
  ([k, v]) =>
    /['"`<>{}\n]/.test(v) ||
    JP_RE.test(v) ||
    (v.includes('\\') && !k.includes('\\')) ||
    (k.endsWith('\\') && !v.endsWith('\\')) ||
    (k.endsWith('$') && !v.endsWith('$')) ||
    (k.startsWith('$') && !v.startsWith('$')),
)
for (const [k, v] of bad) console.warn(`unsafe or untranslated value: ${k} -> ${v}`)

const keys = Object.keys(missing)
writeFileSync(join(ROOT, 'i18n', 'missing.json'), `${JSON.stringify(missing, null, 2)}\n`)
console.log(`dictionary: ${Object.keys(dict).length} entries, missing: ${keys.length}`)
if (process.argv.includes('--check') && (keys.length || bad.length)) process.exit(1)
