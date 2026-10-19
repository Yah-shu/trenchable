import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DialogueEditor, NarrationEditor } from './AudioEditors.tsx'

describe('audio purpose editors', () => {
  it('adds and reorders dialogue speaker rows', () => {
    const onChange = vi.fn()
    render(<DialogueEditor value={[{ text: 'A', voice: 'v1' }]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '話者行を追加' }))
    expect(onChange).toHaveBeenCalledWith([
      { text: 'A', voice: 'v1' },
      { text: '', voice: '' },
    ])
  })

  it('shows automatic previous and next context for narration segments', () => {
    render(<NarrationEditor value={'最初の段落\n\n中央の段落\n\n最後の段落'} onChange={() => undefined} />)
    expect(screen.getAllByText(/前文:/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/次文:/).length).toBeGreaterThan(0)
  })
})
