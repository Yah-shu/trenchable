import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioPlayerProvider } from './AudioPlayer.tsx'
import { useAudioPlayer } from './audioPlayerContext.ts'

function Page({ label }: { label: string }) {
  const player = useAudioPlayer()
  return (
    <div>
      <span>{label}</span>
      <button type="button" onClick={() => player.play({
        kind: 'audio',
        url: `https://cdn.example.com/${label}.mp3`,
        title: label,
      })}>
        {label}を再生
      </button>
    </div>
  )
}

describe('AudioPlayerProvider', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  })

  it('keeps one player and the active track while page content changes', () => {
    const view = render(
      <AudioPlayerProvider><Page label="A" /></AudioPlayerProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Aを再生' }))
    expect(screen.getByText('A', { selector: 'p' })).toBeInTheDocument()

    view.rerender(
      <AudioPlayerProvider><Page label="B" /></AudioPlayerProvider>,
    )
    expect(screen.getByText('A', { selector: 'p' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bを再生' }))
    expect(screen.getByText('B', { selector: 'p' })).toBeInTheDocument()
    expect(view.container.querySelectorAll('audio')).toHaveLength(1)
  })
})
