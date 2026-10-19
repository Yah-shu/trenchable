import { readPersistedJson, writePersistedJson } from './usePersistedState.ts'

export interface PromptSnippet {
  id: string
  title: string
  text: string
  createdAt: number
}

const KEY = 'kie-studio-snippets'
const MAX_ITEMS = 50

export function loadSnippets(): PromptSnippet[] {
  return readPersistedJson<PromptSnippet[]>(KEY, [], (parsed) =>
    Array.isArray(parsed) ? (parsed as PromptSnippet[]) : undefined)
}

function save(items: PromptSnippet[]) {
  // 容量超過などで保存できない場合は諦める（UI 側の state は維持される）
  writePersistedJson(KEY, items)
}

export function addSnippet(title: string, text: string): PromptSnippet[] {
  const item: PromptSnippet = {
    id: `sn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: title.trim() || text.trim().slice(0, 24),
    text,
    createdAt: Date.now(),
  }
  const next = [item, ...loadSnippets()].slice(0, MAX_ITEMS)
  save(next)
  return next
}

export function removeSnippet(id: string): PromptSnippet[] {
  const next = loadSnippets().filter((s) => s.id !== id)
  save(next)
  return next
}
