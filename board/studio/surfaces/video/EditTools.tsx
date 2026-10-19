/**
 * Edit Video, as theirs: a card ("EDITING TOOLS — Modify, restyle, change angles,
 * transform") over a list of tools, each a row with an icon, a name, one line and a
 * chevron. Picking one swaps the rail to that tool's form with the tool card on top and a
 * `Change` back to the list.
 *
 * Edit, Extend, Upscale and Lip-sync (a Trenchable extra) run on Kie. Remove Background, SDR
 * to HDR, FPS Boost and Depth Map have no Kie model: they run on this PC's graphics card
 * (LocalTools.tsx → server/studio/localtools.ts), free, and their rows say so. Reframe pads the
 * clip here and has a Kie video-edit model fill the edges, so its row says it runs on Kie.
 */
import type { ReactNode } from 'react'
import { ArrowLeftRight, ChevronRight, Crop, FastForward, Gauge, Layers, Maximize2, Scissors, Speech, Sun, WandSparkles, Wrench, type LucideIcon } from 'lucide-react'
import { RailCanvas } from '../../RailStudio.tsx'
import { useVideoFeed } from './genjutsu/mine.ts'
import { EDIT_TOOLS, type EditTool } from './modes.ts'
import './video.css'
import './localtools.css'

interface ToolSpec {
  icon: LucideIcon
  name: string
  desc: string
  /** Where it runs, on the row: the local tools are free, Reframe is Kie's price. */
  where?: 'pc' | 'kie-pad'
}

export const TOOL_SPECS: Record<EditTool, ToolSpec> = {
  edit: { icon: WandSparkles, name: 'Edit Video', desc: 'Make targeted changes' },
  extend: { icon: FastForward, name: 'Extend Video', desc: 'Generate a continuation' },
  reframe: { icon: Crop, name: 'Reframe', desc: 'Resize and reposition for any format', where: 'kie-pad' },
  upscale: { icon: Maximize2, name: 'Upscale', desc: 'Increase resolution' },
  lipsync: { icon: Speech, name: 'Lip-sync', desc: 'Sync a mouth to a voice, or make a photo talk' },
  removebg: { icon: Scissors, name: 'Remove Background', desc: 'Cut out the object', where: 'pc' },
  hdr: { icon: Sun, name: 'SDR to HDR', desc: 'Convert SDR footage to HDR', where: 'pc' },
  fps: { icon: Gauge, name: 'FPS Boost', desc: 'Increase frame rate', where: 'pc' },
  depth: { icon: Layers, name: 'Depth Map', desc: 'Depth maps from media', where: 'pc' },
}

/** The row's tag: "Free · your PC" for a local tool, "Kie" for Reframe. */
function WhereTag({ tool }: { tool: EditTool }) {
  const where = TOOL_SPECS[tool].where
  if (!where) return null
  return where === 'pc' ? (
    <span className="st-tool-tag is-free" title="Runs on your PC's graphics card — no credits">
      Free · your PC
    </span>
  ) : (
    <span className="st-tool-tag" title="Padded on your PC, the edges painted on Kie">
      Kie
    </span>
  )
}

/** The "EDITING TOOLS" card above the list. */
function ToolsBanner() {
  return (
    <div className="st-vcard is-banner">
      <span className="st-vcard-thumb">
        <Wrench size={18} />
      </span>
      <span className="st-vcard-text">
        <span className="st-vcard-kicker">Editing tools</span>
        <span className="st-vcard-title">Modify, restyle, change angles, transform</span>
      </span>
    </div>
  )
}

export function ToolList({ onPick }: { onPick: (t: EditTool) => void }) {
  return (
    <div className="st-tools">
      <ToolsBanner />
      <div className="st-tool-list" role="list">
        {EDIT_TOOLS.map((id) => {
          const { icon: Icon, name, desc } = TOOL_SPECS[id]
          return (
            <button key={id} type="button" role="listitem" className="st-tool-row" onClick={() => onPick(id)} data-tool={id}>
              <span className="st-tool-icon">
                <Icon size={16} />
              </span>
              <span className="st-tool-text">
                <span className="st-tool-name">
                  {name}
                  <WhereTag tool={id} />
                </span>
                <span className="st-tool-desc">{desc}</span>
              </span>
              <ChevronRight size={15} className="st-tool-chev" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The picked tool, on top of its form, with `Change` back to the list. */
export function ToolCard({ tool, onChange }: { tool: EditTool; onChange: () => void }) {
  const { icon: Icon, name, desc } = TOOL_SPECS[tool]
  return (
    <div className="st-vcard">
      <span className="st-vcard-thumb">
        <Icon size={18} />
      </span>
      <span className="st-vcard-text">
        <span className="st-vcard-kicker">Edit video</span>
        <span className="st-vcard-title">
          {name}
        </span>
        <span className="st-vcard-sub">
          {desc} <WhereTag tool={tool} />
        </span>
      </span>
      <button type="button" className="vw-btn is-sm st-vcard-change" onClick={onChange}>
        <ArrowLeftRight size={12} /> Change
      </button>
    </div>
  )
}

/** Edit Video with no tool picked: the list in the rail, the Video feed beside it. */
export function ToolsHome({ header, onPick }: { header: ReactNode; onPick: (t: EditTool) => void }) {
  const feed = useVideoFeed()
  return (
    <div className="st-split">
      <aside className="st-rail">
        {header}
        <ToolList onPick={onPick} />
      </aside>
      <RailCanvas surface="video" category="video" historyFilter={feed} emptyTitle="No clips yet" emptySub="Pick a tool on the left. Edits, extensions and upscales land here with everything else you make in Video." />
    </div>
  )
}
