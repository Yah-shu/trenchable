/**
 * Studio: the generation studio, running on Kie.
 *
 * One surface at a time, the surface chosen by the hash:
 *   #/gen            Image
 *   #/gen/<surface>  that surface (see nav.ts for the list)
 *
 * The shell's lane strip (board/shell/Lanes.tsx) is the nav and shows the Kie credits; Studio
 * contributes no chrome of its own. The look is Plinth (theme/plinth.css).
 */
import { routeToSurface, surfaceOf } from './nav.ts'
import { ImageSurface } from './surfaces/ImageSurface.tsx'
import { VideoSurface } from './surfaces/VideoSurface.tsx'
import { GenjutsuSurface } from './surfaces/GenjutsuSurface.tsx'
import { AudioSurface } from './surfaces/AudioSurface.tsx'
import { EffectsSurface } from './surfaces/EffectsSurface.tsx'
import { PresetsSurface } from './surfaces/PresetsSurface.tsx'
import { InfluencerSurface } from './surfaces/InfluencerSurface.tsx'
import { MarketingSurface } from './surfaces/MarketingSurface.tsx'
import { CinemaSurface } from './surfaces/CinemaSurface.tsx'
import { AssetsSurface } from './surfaces/AssetsSurface.tsx'
import { EditSurface } from './surfaces/EditSurface.tsx'
import { CanvasSurface } from './surfaces/CanvasSurface.tsx'
import { LayersSurface } from './surfaces/LayersSurface.tsx'
import { Viewer } from './Viewer.tsx'
import { Handover, ShellSurface } from './surfaces/Handover.tsx'

function Surface({ id }: { id: string }) {
  const s = surfaceOf(id)
  // Advanced is the Kie Studio form, mounted by the shell as a frame so it keeps its
  // state between visits; Studio renders nothing behind it.
  if (id === 'advanced') return null
  if (s.kind === 'trenchable' && s.handover) return <Handover surface={s} />
  if (s.kind === 'shell') return <ShellSurface surface={s} />
  switch (id) {
    case 'video':
      return <VideoSurface />
    case 'genjutsu':
      return <GenjutsuSurface />
    case 'audio':
      return <AudioSurface />
    case 'effects':
      return <EffectsSurface />
    case 'presets':
      return <PresetsSurface />
    case 'influencer':
      return <InfluencerSurface />
    case 'marketing':
      return <MarketingSurface />
    case 'cinema':
      return <CinemaSurface />
    case 'assets':
      return <AssetsSurface />
    case 'edit':
      return <EditSurface />
    case 'canvas':
      return <CanvasSurface />
    case 'layers':
      return <LayersSurface />
    default:
      return <ImageSurface />
  }
}

export function Studio({ route }: { route: string }) {
  const id = routeToSurface(route)
  return (
    <div className="st-root">
      <div className="st-surface">
        {/* Keyed so each surface starts clean rather than inheriting the last one's state. */}
        <Surface key={id} id={id} />
      </div>
      {/* One viewer for every surface: any tile opens it (viewer.ts). */}
      <Viewer />
    </div>
  )
}
