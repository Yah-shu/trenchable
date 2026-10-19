/**
 * An effect's sample animation, on its card until one of your own results becomes the cover (EffectCover.tsx).
 *
 * One small scene drawn in SVG — sky, sun, hills, ground and a figure (a bottle for the product recipes) — coloured
 * by CSS variables, so a look recolours it (noir, golden hour, neon night) without a second drawing. Each effect is
 * a few classes on it, all in demos.css:
 *   cam-*    the camera: the frame moves (dolly, orbit, crane, whip pan…)
 *   fx-*     the subject changes (melts, levitates, glitches, turns to stone…), with the bits it needs drawn in
 *   look-*   the frame is restyled (palette, film grain, polaroid border, halftone, sketch…)
 *   frame    an overlay drawn over the picture (phone, mirror, car window, split, article, sale badge, poster type)
 *
 * The figure and the landscape are drawn once in <defs> and placed with <use>, so copies (clones, the glitch's colour
 * ghosts, the stone and hologram versions, the rack focus's soft layer) cost one element each and pick up their own
 * colours from the variables. No media files: animations run only while the card is on screen, never under
 * "reduce motion".
 */
import { useEffect, useId, useRef, useState } from 'react'
import './demos.css'

type Bit =
  | 'particles' | 'petals' | 'flames' | 'drips' | 'drops' | 'neon' | 'clones' | 'rgb' | 'stone' | 'holo' | 'globe' | 'eye'
  | 'paint' | 'buildings' | 'clothes' | 'grey-hair' | 'hand' | 'podium' | 'splash' | 'ingredients' | 'desk' | 'box'
  | 'wind' | 'mouth' | 'morph' | 'rack'
type Frame = 'polaroid' | 'phone' | 'mirror' | 'car' | 'split' | 'article' | 'sale' | 'type' | 'movie' | 'stamp' | 'scanlines' | 'grain' | 'halftone' | 'vignette'

interface Demo {
  /** The figure (default) or a product bottle. */
  product?: boolean
  cam?: string
  fx?: string
  look?: string
  bits?: Bit[]
  frames?: Frame[]
}

/** Every recipe in presets.ts, by id. Unknown ids drift gently over the plain scene. */
const DEMOS: Record<string, Demo> = {
  // Camera moves
  'cam-dolly-in': { cam: 'dolly-in' },
  'cam-dolly-out': { cam: 'dolly-out' },
  'cam-dolly-zoom': { cam: 'dolly-zoom' },
  'cam-crash-zoom': { cam: 'crash-zoom' },
  'cam-orbit': { cam: 'orbit' },
  'cam-arc': { cam: 'arc' },
  'cam-fpv': { cam: 'fpv' },
  'cam-drone-reveal': { cam: 'drone-reveal' },
  'cam-crane-up': { cam: 'crane-up' },
  'cam-crane-down': { cam: 'crane-down' },
  'cam-bullet-time': { cam: 'bullet-time', fx: 'jump', bits: ['drops'] },
  'cam-whip-pan': { cam: 'whip-pan' },
  'cam-handheld': { cam: 'handheld' },
  'cam-steadicam': { cam: 'steadicam', fx: 'walk' },
  'cam-tracking': { cam: 'tracking', fx: 'walk' },
  'cam-low-push': { cam: 'low-push' },
  'cam-top-down': { cam: 'top-down' },
  'cam-rack-focus': { cam: 'rack-focus', bits: ['rack'] },
  'cam-snorricam': { cam: 'snorricam' },
  'cam-tilt-reveal': { cam: 'tilt-reveal' },
  // Effects
  'fx-disintegrate': { fx: 'disintegrate', bits: ['particles'] },
  'fx-freeze': { cam: 'arc', fx: 'jump', bits: ['drops'] },
  'fx-levitate': { fx: 'levitate' },
  'fx-petals': { fx: 'petals', bits: ['petals'] },
  'fx-melt': { fx: 'melt', bits: ['drips'] },
  'fx-stone': { fx: 'stone', bits: ['stone'] },
  'fx-fire': { fx: 'fire', bits: ['flames'] },
  'fx-glitch': { fx: 'glitch', bits: ['rgb'] },
  'fx-hologram': { fx: 'hologram', bits: ['holo'], frames: ['scanlines'] },
  'fx-earth-zoom': { cam: 'earth-zoom', bits: ['globe'] },
  'fx-morph': { fx: 'morph', bits: ['morph'] },
  'fx-paint': { fx: 'paint', bits: ['paint'] },
  'fx-slowmo': { fx: 'slowmo', bits: ['drops'] },
  'fx-neon': { look: 'night', fx: 'walk', bits: ['neon'] },
  'fx-vanish': { fx: 'vanish', bits: ['clothes'] },
  'fx-eye-dive': { fx: 'eye-dive', bits: ['eye'] },
  'fx-clones': { fx: 'clones', bits: ['clones'] },
  'fx-giant': { fx: 'giant', bits: ['buildings'] },
  'fx-world-fold': { fx: 'world-fold' },
  'fx-high-flip': { cam: 'flip' },
  // Looks
  'style-35mm': { look: 'film', cam: 'drift', frames: ['grain', 'vignette'] },
  'style-disposable': { look: 'flash', cam: 'drift', frames: ['stamp'] },
  'style-polaroid': { look: 'faded', cam: 'drift', frames: ['polaroid'] },
  'style-anime': { look: 'anime', cam: 'drift' },
  'style-clay': { look: 'clay', cam: 'drift' },
  'style-watercolour': { look: 'watercolour', cam: 'drift' },
  'style-oil': { look: 'oil', cam: 'drift' },
  'style-comic': { look: 'comic', cam: 'drift', frames: ['halftone'] },
  'style-noir': { look: 'noir', cam: 'drift', frames: ['vignette'] },
  'style-neon': { look: 'night', cam: 'drift', bits: ['neon'] },
  'style-sketch': { look: 'sketch', cam: 'drift' },
  'style-iso': { look: 'iso', cam: 'iso' },
  // Motion
  'motion-talking': { cam: 'close', fx: 'talk', bits: ['mouth'] },
  'motion-orbit': { product: true, look: 'studio', cam: 'orbit' },
  'motion-walkup': { cam: 'handheld', fx: 'walk-up' },
  'motion-hair-wind': { cam: 'close', fx: 'wind', bits: ['wind'] },
  'motion-unbox': { product: true, look: 'studio', fx: 'unbox', bits: ['box', 'hand'] },
  // Product shots
  'product-clean': { product: true, look: 'studio', cam: 'drift' },
  'product-hand': { product: true, look: 'day', bits: ['hand'] },
  'product-flatlay': { product: true, look: 'flatlay', bits: ['ingredients'] },
  'product-levitate': { product: true, look: 'studio', fx: 'levitate' },
  'product-splash': { product: true, look: 'studio', bits: ['splash'] },
  'product-podium': { product: true, look: 'studio', fx: 'lift', bits: ['podium'] },
  'product-macro': { product: true, look: 'studio', cam: 'macro', frames: ['vignette'] },
  // UGC
  'ugc-selfie': { cam: 'selfie', frames: ['phone'] },
  'ugc-mirror': { look: 'room', frames: ['mirror'] },
  'ugc-desk': { product: true, look: 'desk', bits: ['desk'] },
  'ugc-car': { cam: 'car', frames: ['car'] },
  // Portraits
  'portrait-studio': { look: 'studio', cam: 'drift', frames: ['vignette'] },
  'portrait-headshot': { look: 'backdrop', cam: 'headshot' },
  'portrait-golden': { look: 'golden', cam: 'drift' },
  'portrait-age': { fx: 'age', cam: 'close', bits: ['grey-hair'] },
  // Ads and posters
  'ads-before-after': { frames: ['split'] },
  'ads-native': { cam: 'drift', frames: ['article'] },
  'ads-sale': { product: true, look: 'studio', frames: ['sale'] },
  'poster-type': { look: 'poster', frames: ['type'] },
  'poster-movie': { look: 'night', cam: 'drift', frames: ['movie'] },
}

export const hasDemo = (id: string) => id in DEMOS

/* ---------- play only while on screen ---------- */

const listeners = new Map<Element, (on: boolean) => void>()
let observer: IntersectionObserver | null = null

function watch(el: Element, onChange: (on: boolean) => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onChange(true)
    return () => {}
  }
  observer ??= new IntersectionObserver((entries) => entries.forEach((e) => listeners.get(e.target)?.(e.isIntersecting)), { rootMargin: '120px' })
  listeners.set(el, onChange)
  observer.observe(el)
  return () => {
    listeners.delete(el)
    observer?.unobserve(el)
  }
}

/* ---------- the drawing ---------- */

function Person() {
  return (
    <g>
      <rect className="d-legs" x="44.5" y="88" width="11" height="17" rx="2" />
      <path className="d-shirt" d="M39.5 92 Q39.5 72 50 70 Q60.5 72 60.5 92 Z" />
      <circle className="d-skin" cx="50" cy="62.5" r="7" />
      <path className="d-hair" d="M42.8 62 Q43.5 54.2 50 54 Q56.8 54.2 57.3 62 Q54.5 58 50 58.4 Q45.6 58 42.8 62 Z" />
    </g>
  )
}

function Bottle() {
  return (
    <g>
      <rect className="d-cap" x="45.5" y="69" width="9" height="7" rx="1.4" />
      <rect className="d-bottle" x="40.5" y="75" width="19" height="30" rx="4.5" />
      <rect className="d-label" x="43" y="84" width="14" height="11" rx="1.6" />
      <rect className="d-shine" x="43" y="77.5" width="2.2" height="24" rx="1.1" />
    </g>
  )
}

function Land() {
  return (
    <g>
      <rect className="d-sky" x="-70" y="-70" width="240" height="180" />
      <circle className="d-sun" cx="73" cy="30" r="9" />
      <path className="d-far" d="M-70 90 Q-30 66 10 82 Q40 70 70 80 Q110 64 170 84 V150 H-70 Z" />
      <path className="d-near" d="M-70 99 Q-10 86 40 96 Q90 84 170 94 V150 H-70 Z" />
      <rect className="d-ground" x="-70" y="103" width="240" height="90" />
    </g>
  )
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

function Behind({ bits }: { bits: Bit[] }) {
  const has = (b: Bit) => bits.includes(b)
  return (
    <>
      {has('buildings') && (
        <g className="d-buildings">
          {[[12, 14], [20, 22], [30, 11], [64, 18], [73, 25], [83, 13]].map(([x, h]) => (
            <rect key={x} className="d-building" x={x} y={105 - h} width="8" height={h} />
          ))}
        </g>
      )}
      {has('podium') && (
        <g className="d-podium">
          <rect x="31" y="103" width="38" height="14" />
          <ellipse cx="50" cy="103" rx="19" ry="3.5" />
        </g>
      )}
      {has('ingredients') && (
        <g className="d-ingredients">
          {[[24, 70, 6], [76, 64, 5], [26, 108, 5], [74, 106, 7], [50, 118, 4], [50, 50, 4]].map(([cx, cy, r], i) => (
            <circle key={i} cx={cx} cy={cy} r={r} className={`d-ing d-ing-${i % 3}`} />
          ))}
        </g>
      )}
      {has('desk') && (
        <g className="d-desk">
          <rect className="d-mug" x="18" y="92" width="11" height="13" rx="2" />
          <rect className="d-book" x="64" y="99" width="22" height="6" rx="1" />
          <rect className="d-book2" x="66" y="94" width="18" height="5" rx="1" />
        </g>
      )}
      {has('splash') && (
        <g className="d-splash">
          {range(7).map((i) => (
            <ellipse key={i} cx={50 + Math.cos((i / 7) * Math.PI * 2) * 15} cy={88 + Math.sin((i / 7) * Math.PI * 2) * 13} rx="3.4" ry="2" style={{ animationDelay: `${i * -0.25}s` }} />
          ))}
        </g>
      )}
      {has('neon') && <path className="d-neon" d="M10 104 C25 80, 40 112, 50 88 S80 70, 95 92" />}
    </>
  )
}

function OnSubject({ bits, subj }: { bits: Bit[]; subj: string }) {
  const has = (b: Bit) => bits.includes(b)
  return (
    <>
      {has('clones') && (
        <>
          <use href={`#${subj}`} className="d-clone d-clone-l" />
          <use href={`#${subj}`} className="d-clone d-clone-r" />
        </>
      )}
      {has('rgb') && (
        <>
          <use href={`#${subj}`} className="d-ghost d-ghost-r" />
          <use href={`#${subj}`} className="d-ghost d-ghost-c" />
        </>
      )}
      {has('stone') && <use href={`#${subj}`} className="d-stone" />}
      {has('holo') && <use href={`#${subj}`} className="d-holo" />}
      {has('particles') && (
        <g className="d-particles">
          {range(12).map((i) => (
            <circle key={i} cx={44 + (i % 4) * 4} cy={64 + Math.floor(i / 4) * 12} r="1.3" style={{ animationDelay: `${(i % 6) * 0.12}s` }} />
          ))}
        </g>
      )}
      {has('petals') && (
        <g className="d-petals">
          {range(10).map((i) => (
            <ellipse key={i} cx="50" cy="80" rx="2.2" ry="1.2" style={{ ['--a' as string]: `${i * 36}deg`, animationDelay: `${(i % 3) * 0.08}s` }} />
          ))}
        </g>
      )}
      {has('flames') && (
        <g className="d-flames">
          {[[37, 0], [44, 0.3], [56, 0.15], [63, 0.45], [50, 0.6]].map(([x, d]) => (
            <path key={x} d={`M${x - 5} 106 Q${x - 4} 90 ${x} 78 Q${x + 4} 90 ${x + 5} 106 Z`} style={{ animationDelay: `${-d}s` }} />
          ))}
        </g>
      )}
      {has('drips') && (
        <g className="d-drips">
          {[44, 50, 56].map((x, i) => (
            <ellipse key={x} cx={x} cy="96" rx="1.8" ry="2.6" style={{ animationDelay: `${i * 0.35}s` }} />
          ))}
        </g>
      )}
      {has('clothes') && <path className="d-clothes" d="M39.5 92 Q39.5 72 50 70 Q60.5 72 60.5 92 Z" />}
      {has('grey-hair') && <path className="d-grey" d="M42.8 62 Q43.5 54.2 50 54 Q56.8 54.2 57.3 62 Q54.5 58 50 58.4 Q45.6 58 42.8 62 Z" />}
      {has('mouth') && <ellipse className="d-mouth" cx="50" cy="66" rx="2" ry="0.9" />}
      {has('wind') && (
        <g className="d-wind">
          {[50, 56, 62].map((y, i) => (
            <path key={y} d={`M-10 ${y} Q20 ${y - 3} 44 ${y}`} style={{ animationDelay: `${i * 0.4}s` }} />
          ))}
        </g>
      )}
      {has('hand') && <path className="d-hand" d="M30 112 Q32 96 40 92 L41 100 Q36 104 37 112 Z M60 92 Q68 96 70 112 L63 112 Q64 104 59 100 Z" />}
      {has('box') && (
        <g className="d-box">
          <rect className="d-box-body" x="34" y="92" width="32" height="15" rx="1.5" />
          <rect className="d-box-lid" x="33" y="88" width="34" height="5" rx="1.2" />
        </g>
      )}
    </>
  )
}

/** Over the whole frame, outside the moving subject: frozen drops, paint, the globe, the eye. */
function Top({ bits }: { bits: Bit[] }) {
  const has = (b: Bit) => bits.includes(b)
  return (
    <>
      {has('drops') && (
        <g className="d-drops">
          {range(14).map((i) => (
            <ellipse key={i} cx={(i * 37) % 100} cy={10 + ((i * 53) % 90)} rx="0.9" ry="2.4" />
          ))}
        </g>
      )}
      {has('paint') && (
        <g className="d-paint">
          {[[30, 40, 'a'], [70, 70, 'b'], [40, 95, 'c'], [80, 25, 'b'], [20, 110, 'a']].map(([cx, cy, k], i) => (
            <circle key={i} cx={cx} cy={cy} r="30" className={`d-paint-${k}`} style={{ animationDelay: `${i * 0.3}s` }} />
          ))}
        </g>
      )}
      {has('globe') && (
        <g className="d-globe">
          <circle cx="50" cy="62" r="22" className="d-globe-sea" />
          <path className="d-globe-land" d="M36 52 Q44 44 52 50 Q50 58 42 60 Z M54 64 Q64 58 68 68 Q60 76 54 72 Z M40 70 Q46 68 48 76 Q42 80 38 76 Z" />
        </g>
      )}
      {has('eye') && (
        <g className="d-eye">
          <ellipse cx="50" cy="62" rx="22" ry="12" className="d-eye-white" />
          <circle cx="50" cy="62" r="7.5" className="d-iris" />
          <circle cx="50" cy="62" r="3.2" className="d-pupil" />
        </g>
      )}
    </>
  )
}

export function EffectDemo({ id }: { id: string }) {
  const demo = DEMOS[id] ?? { cam: 'drift' }
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const subj = `d-subj-${uid}`
  const land = `d-land-${uid}`
  const soft = `d-soft-${uid}`
  const ref = useRef<HTMLSpanElement>(null)
  const [on, setOn] = useState(false)
  useEffect(() => (ref.current ? watch(ref.current, setOn) : undefined), [])

  const bits = demo.bits ?? []
  const classes = ['ef-demo', demo.cam && `cam-${demo.cam}`, demo.fx && `fx-${demo.fx}`, demo.look && `look-${demo.look}`, demo.product && 'is-product', on && 'is-on']
  return (
    <span ref={ref} className={classes.filter(Boolean).join(' ')} aria-hidden="true">
      <span className="d-cam">
        {/* The view starts 22 units down the drawing, so the figure sits in the upper two thirds, clear of the card's words. */}
        <svg viewBox="0 22 100 125" preserveAspectRatio="xMidYMid slice">
          <defs>
            <g id={land}>
              <Land />
            </g>
            <g id={subj}>{demo.product ? <Bottle /> : <Person />}</g>
            {bits.includes('morph') && <g id={`${subj}-b`}>{demo.product ? <Person /> : <Bottle />}</g>}
            <filter id={soft} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.8" />
            </filter>
          </defs>
          <g className="d-world">
            <g className="d-bg">
              <use href={`#${land}`} />
            </g>
            {bits.includes('rack') && (
              <g className="d-bg-soft" filter={`url(#${soft})`}>
                <use href={`#${land}`} />
              </g>
            )}
            <Behind bits={bits} />
            <ellipse className="d-shadow" cx="50" cy="105" rx="11" ry="2.2" />
            <g className="d-subj">
              <use href={`#${subj}`} className="d-subj-main" />
              {bits.includes('morph') && <use href={`#${subj}-b`} className="d-subj-alt" />}
              {bits.includes('rack') && <use href={`#${subj}`} className="d-subj-soft" filter={`url(#${soft})`} />}
              <OnSubject bits={bits} subj={subj} />
            </g>
          </g>
          <Top bits={bits} />
        </svg>
      </span>
      {(demo.frames ?? []).map((f) => (
        <span key={f} className={`d-frame d-frame-${f}`}>
          {f === 'stamp' && "'98 10 19"}
          {f === 'sale' && (
            <>
              <b>-50%</b>
              <i>SALE</i>
            </>
          )}
          {f === 'type' && (
            <>
              <b>BOLD</b>
              <b>TYPE</b>
            </>
          )}
          {f === 'movie' && (
            <>
              <b>THE TITLE</b>
              <i>COMING SOON</i>
            </>
          )}
          {f === 'article' && (
            <>
              <i />
              <i />
              <i />
              <i />
            </>
          )}
        </span>
      ))}
    </span>
  )
}
