/** Result URL heuristic shared by gallery display and input routing. */
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url) || url.includes('video')
}

export function isAudioUrl(url: string): boolean {
  const clean = url.split(/[?#]/, 1)[0]?.toLowerCase() ?? ''
  return /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(clean)
}

export function mediaKindFromUrl(
  url: string,
  fallback: 'image' | 'video' | 'audio' = 'image',
): 'image' | 'video' | 'audio' {
  if (isVideoUrl(url)) return 'video'
  if (isAudioUrl(url)) return 'audio'
  return fallback
}
