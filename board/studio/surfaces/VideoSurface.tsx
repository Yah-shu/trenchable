/**
 * Video — the reference app's three tabs across the top of the rail: Create Video, Edit Video and
 * Motion Control. Edit Video is a list of tools (video/EditTools.tsx); the Kie-backed ones
 * (Edit, Extend, Upscale, Lip-sync) are the old modes' forms, and Reframe, Remove Background,
 * SDR → HDR, FPS Boost and Depth Map run through Trenchable's local tools (video/LocalTools.tsx).
 *
 * Each form is its own RailStudio (video/VideoModes.tsx) with its own draft; all of them
 * show the one Video feed. This file owns the switch and the handoff: a handoff names one
 * of the old six modes (STUDIO-ENGINE.md, "Handoff contract"), which maps to a tab and a
 * tool (`placeForHandoff`), so the place is switched first and that form, mounting fresh,
 * takes the same handoff's prompt, slots and model. The very first render reads a waiting
 * handoff, so the right form mounts straight away. Tab and tool survive a reload.
 *
 * GenShitSu used to be Create Video's special preset; since 2026-10-19 it is its own lane
 * (GenjutsuSurface.tsx) and nothing of it is left here. Video's History leaves its clips out
 * (video/genjutsu/mine.ts); Motion Control stays, the simple one-character form.
 */
import { useEffect, useState } from 'react'
import { loadMode, saveMode } from '../draft.ts'
import { takeHandoff, useHandoff, type Handoff } from '../handoff.ts'
import { TopTabs } from './video/ModeBar.tsx'
import { ToolCard, ToolsHome } from './video/EditTools.tsx'
import { LocalToolMode } from './video/LocalTools.tsx'
import { EDIT_TOOLS, VIDEO_MODES, VIDEO_TABS, isLocalTool, modeForHandoff, placeForHandoff, placeForSaved, type EditTool, type VideoPlace, type VideoTab } from './video/modes.ts'
import { CreateMode, EditMode, ExtendMode, LipsyncMode, MotionMode, UpscaleMode, type LipKind } from './video/VideoModes.tsx'

const TABS: { id: VideoTab; label: string }[] = [
  { id: 'create', label: 'Create Video' },
  { id: 'edit', label: 'Edit Video' },
  { id: 'motion', label: 'Motion Control' },
]

/** What a handoff asks of this surface, beyond what each RailStudio applies itself. */
function read(h: Handoff | null) {
  if (!h) return null
  const mode = modeForHandoff(h.mode, h.slots)
  return {
    place: placeForHandoff(h.mode, h.slots),
    lip: h.slots?.face ? ('photo' as const) : h.slots?.video && mode === 'lipsync' ? ('clip' as const) : null,
    source: h.sourceTaskId ?? null,
    // A bare clip sent to Extend: there is no job id to continue from.
    stray: mode === 'extend' && !h.sourceTaskId && Boolean(h.slots?.video),
  }
}

/** The tab and tool last open; a tab saved before the three tabs (`extend`, …) maps over. */
const savedPlace = (): VideoPlace => placeForSaved(loadMode('video', [...VIDEO_TABS, ...VIDEO_MODES]), loadMode('video.edit', EDIT_TOOLS))

export function VideoSurface() {
  const [first] = useState(() => read(takeHandoff('video')))
  const [place, setPlace] = useState<VideoPlace>(() => first?.place ?? savedPlace())
  useEffect(() => {
    saveMode('video', place.tab)
    // The tool is kept while you visit another tab; 'list' is the list itself.
    if (place.tab === 'edit') saveMode('video.edit', place.tool ?? 'list')
  }, [place])
  const [lipKind, setLipKind] = useState<LipKind>(first?.lip ?? 'clip')
  const [sourceId, setSourceId] = useState<string | null>(first?.source ?? null)
  const [stray, setStray] = useState(first?.stray ?? false)

  useHandoff('video', (h) => {
    const r = read(h)
    if (!r) return
    if (r.place) setPlace(r.place)
    if (r.lip) setLipKind(r.lip)
    if (r.source) setSourceId(r.source)
    setStray(r.stray)
  })

  const pickTab = (tab: VideoTab) => {
    setStray(false)
    setPlace((p) => {
      // Edit Video again while on it: back to the tool list.
      if (tab === 'edit') return p.tab === 'edit' ? { tab, tool: null } : { tab, tool: loadMode('video.edit', EDIT_TOOLS) }
      return { tab, tool: p.tool }
    })
  }
  const pickTool = (tool: EditTool | null) => {
    setStray(false)
    setPlace({ tab: 'edit', tool })
  }
  const tabs = <TopTabs tabs={TABS} value={place.tab} onPick={pickTab} />

  if (place.tab === 'create') return <CreateMode header={tabs} />
  if (place.tab === 'motion') return <MotionMode header={tabs} />

  const tool = place.tool
  if (!tool) return <ToolsHome header={tabs} onPick={pickTool} />
  const back = () => pickTool(null)
  const header = (
    <>
      {tabs}
      <ToolCard tool={tool} onChange={back} />
    </>
  )
  if (isLocalTool(tool)) return <LocalToolMode key={tool} header={header} tool={tool as 'reframe' | 'removebg' | 'hdr' | 'fps' | 'depth'} />
  switch (tool) {
    case 'extend':
      return <ExtendMode header={header} sourceId={sourceId} setSourceId={setSourceId} stray={stray} />
    case 'upscale':
      return <UpscaleMode header={header} sourceId={sourceId} setSourceId={setSourceId} />
    case 'lipsync':
      return <LipsyncMode header={header} kind={lipKind} setKind={setLipKind} />
    default:
      return <EditMode header={header} />
  }
}
