import type { MentionStyle } from './types.ts'

export function formatMention(style: MentionStyle, index1Based: number): string {
  switch (style) {
    case 'at-image':
      return `@image${index1Based}`
    case 'at-video':
      return `@Video${index1Based}`
    case 'at-audio':
      return `@Audio${index1Based}`
    case 'bracket-image':
      return `[Image ${index1Based}]`
    case 'none':
      return ''
    default: {
      const _exhaustive: never = style
      return _exhaustive
    }
  }
}

/** Insert token at cursor (or append). Ensures surrounding spaces. */
export function insertMentionToken(
  prompt: string,
  token: string,
  cursor?: number | null,
): { next: string; cursor: number } {
  if (!token) return { next: prompt, cursor: prompt.length }
  const pos =
    typeof cursor === 'number' && cursor >= 0 && cursor <= prompt.length
      ? cursor
      : prompt.length

  const before = prompt.slice(0, pos)
  const after = prompt.slice(pos)
  const needLead = before.length > 0 && !/\s$/.test(before)
  const needTrail = after.length > 0 && !/^\s/.test(after)
  const piece = `${needLead ? ' ' : ''}${token}${needTrail ? ' ' : ' '}`
  const next = `${before}${piece}${after}`
  return { next, cursor: before.length + piece.length }
}
