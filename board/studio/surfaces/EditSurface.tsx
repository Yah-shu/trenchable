/**
 * Edit — the reference app's image tools on one picture: edit with a prompt, inpaint, reframe,
 * relight, new camera angles, upscale, remove the background.
 *
 * The picture belongs to the surface, not to a tool, so switching tool keeps it (paint a
 * fix, then upscale the same picture). A handoff from elsewhere ("Upscale" on a result)
 * arrives as `mode` + `slots.image` (+ `sources.image`, the result it came from, whose
 * archive copy the page can read pixels from): the mode is read before the first render so
 * the right tool mounts with the picture already in it.
 */
import { useEffect, useState, type ComponentType } from 'react'
import { loadMode, saveMode } from '../draft.ts'
import { takeHandoff, useHandoff } from '../handoff.ts'
import { TabBar } from '../parts.tsx'
import { EDIT_MODES, asMode, type EditMode } from './edit/catalog.ts'
import { AnglesTool, BackgroundTool, InpaintTool, PromptTool, ReframeTool, RelightTool, UpscaleTool, type ModeProps } from './edit/modes.tsx'
import { imageFromHandoff, type SourceImage } from './edit/pixels.ts'

const TOOLS: Record<EditMode, ComponentType<ModeProps>> = {
  prompt: PromptTool,
  inpaint: InpaintTool,
  reframe: ReframeTool,
  relight: RelightTool,
  angles: AnglesTool,
  upscale: UpscaleTool,
  background: BackgroundTool,
}

export function EditSurface() {
  const [mode, setMode] = useState<EditMode>(() => asMode(takeHandoff('edit')?.mode) ?? loadMode('edit', EDIT_MODES.map((m) => m.id)) ?? 'prompt')
  useEffect(() => saveMode('edit', mode), [mode])
  const [image, setImage] = useState<SourceImage | null>(() => imageFromHandoff(takeHandoff('edit')))

  useHandoff('edit', (h) => {
    const m = asMode(h.mode)
    if (m) setMode(m)
    const next = imageFromHandoff(h)
    if (next) setImage((cur) => (cur?.url === next.url && cur.local === next.local ? cur : next))
  })

  const header = <TabBar tabs={EDIT_MODES} value={mode} onPick={setMode} />
  const Tool = TOOLS[mode]
  return <Tool key={mode} header={header} image={image} onImage={setImage} />
}
