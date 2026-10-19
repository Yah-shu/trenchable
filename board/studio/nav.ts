/**
 * The surfaces Studio reproduces, in their nav order.
 *
 *
 * `kind` says what actually happens behind the layout:
 *   kie    — runs on Kie through Trenchable's own server
 *   trenchable — another tool does this; the surface hands over to it (none in this app)
 *   shell  — layout only, with an empty state that says what it would need
 */
import {
  Boxes,
  Clapperboard,
  Drama,
  Eraser,
  Film,
  Image as ImageIcon,
  Images,
  LayoutTemplate,
  Megaphone,
  Mic,
  Shapes,
  SlidersHorizontal,
  UserRound,
  Wand2,
  type LucideIcon,
} from 'lucide-react'

export type SurfaceKind = 'kie' | 'trenchable' | 'shell'
export type Archetype = 'feed' | 'rail' | 'project' | 'hub' | 'catalogue' | 'library'

export interface Surface {
  id: string
  label: string
  icon: LucideIcon
  archetype: Archetype
  kind: SurfaceKind
  /** Shown as a small tag in the nav. */
  badge?: string
  /** For `trenchable` surfaces: the hash route (after `#/`) of the Trenchable tool that really does this. */
  handover?: { route: string; tool: string }
  /** For `shell` surfaces: why there is nothing behind it yet. */
  missing?: string
}

// `#/gen` opens Image.
export const SURFACES: Surface[] = [
  { id: 'image', label: 'Image', icon: ImageIcon, archetype: 'feed', kind: 'kie' },
  { id: 'video', label: 'Video', icon: Film, archetype: 'rail', kind: 'kie' },
  // Their "GenShitSu · Top": its own lane since 2026-10-19, apart from Video (surfaces/GenjutsuSurface.tsx).
  { id: 'genjutsu', label: 'GenShitSu', icon: Drama, archetype: 'rail', kind: 'kie' },
  { id: 'audio', label: 'Audio', icon: Mic, archetype: 'rail', kind: 'kie' },
  // Their image tools — upscale, remove background, inpaint, reframe, relight — in one rail.
  { id: 'edit', label: 'Edit', icon: Eraser, archetype: 'rail', kind: 'kie' },
  { id: 'effects', label: 'Effects', icon: Wand2, archetype: 'rail', kind: 'kie' },
  { id: 'presets', label: 'Presets', icon: LayoutTemplate, archetype: 'catalogue', kind: 'kie' },
  { id: 'influencer', label: 'Influencer', icon: UserRound, archetype: 'rail', kind: 'kie' },
  { id: 'marketing', label: 'Marketing', icon: Megaphone, archetype: 'project', kind: 'kie' },
  { id: 'cinema', label: 'Cinema', icon: Clapperboard, archetype: 'project', kind: 'kie' },
  // A node board that chains one generation into the next (React Flow, already a dependency).
  { id: 'canvas', label: 'Canvas', icon: Boxes, archetype: 'hub', kind: 'kie' },
  // Seedream 5's layer decomposition splits a flat image into separate layers.
  { id: 'layers', label: 'Layers', icon: Shapes, archetype: 'hub', kind: 'kie' },
  { id: 'assets', label: 'Assets', icon: Images, archetype: 'library', kind: 'kie' },
  {
    // The old Generate tile. Studio's surfaces offer a fixed set of controls; this is
    // every field of every model, plus Suno and the Veo/Runway workflows. Rendered by
    // the shell as a frame (main.tsx), not by Studio itself.
    id: 'advanced',
    label: 'Advanced',
    icon: SlidersHorizontal,
    archetype: 'hub',
    kind: 'kie',
  },
]

export const SURFACE_IDS = SURFACES.map((s) => s.id)

export const surfaceOf = (id: string): Surface => SURFACES.find((s) => s.id === id) ?? SURFACES[0]

/**
 * `#/gen` opens Image; `#/gen/<id>` opens that surface (main.tsx passes the route as
 * `studio[/<id>]`). Unknown ids (old `#/gen/explore` links) open Image.
 */
export const routeToSurface = (route: string): string => {
  const tail = route.startsWith('studio/') ? route.slice('studio/'.length).split('/')[0] : ''
  return SURFACES.find((x) => x.id === tail)?.id ?? 'image'
}
