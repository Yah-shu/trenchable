/**
 * Where the Studio keeps its files outside the history DB, and where its optional local extras live.
 * Everything defaults to folders inside the project; each can be moved with an environment variable
 * (put it in `.env`). Read on every call, not at import, so tests can point the env at a temp folder.
 *
 *   studioDir()     TRENCHABLE_DATA   elements, projects, uploads, the pricing cache, dub / guided / local-tool runs
 *                                     (default data/studio)
 *   toolsDir()      TRENCHABLE_TOOLS  the optional local GPU tools: venv/ + tools/<tool>.py (default extras/local-tools)
 *   dubPython()     TRENCHABLE_VOICE  the optional voice extra's Python, which runs dub/transcribe.py (default extras/voice)
 *   whisperCache()                    its offline Hugging Face cache, passed as HF_HOME (<voice>/cache)
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const studioDir = (): string => resolve(process.env.TRENCHABLE_DATA ?? join(ROOT, 'data', 'studio'))

export const toolsDir = (): string => resolve(process.env.TRENCHABLE_TOOLS ?? join(ROOT, 'extras', 'local-tools'))

/** A venv's Python: Scripts\python.exe on Windows, bin/python elsewhere. */
export const venvPython = (venv: string): string => (process.platform === 'win32' ? join(venv, 'Scripts', 'python.exe') : join(venv, 'bin', 'python'))

const voiceDir = (): string => resolve(process.env.TRENCHABLE_VOICE ?? join(ROOT, 'extras', 'voice'))

export const dubPython = (): string => venvPython(join(voiceDir(), 'venv'))

export const whisperCache = (): string => join(voiceDir(), 'cache')
