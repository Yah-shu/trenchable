import { createContext, useContext } from 'react'
import type { MediaAsset } from '../../lib/models/types.ts'

export type AudioTrack = MediaAsset & { taskId?: string }

export type AudioPlayerValue = {
  active: AudioTrack | null
  currentTime: number
  duration: number
  playing: boolean
  play: (track: AudioTrack, tracks?: AudioTrack[]) => void
  toggle: () => void
  seek: (seconds: number) => void
}

export const AudioPlayerContext = createContext<AudioPlayerValue | null>(null)

export function useAudioPlayer(): AudioPlayerValue {
  const context = useContext(AudioPlayerContext)
  if (!context) throw new Error('useAudioPlayer must be used inside AudioPlayerProvider')
  return context
}
