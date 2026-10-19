/**
 * Trenchable: an AI image, video and audio studio on Kie.ai, in one page.
 *
 *   #/gen            Image
 *   #/gen/<lane>     that lane (board/studio/nav.ts lists them)
 *   #/gen/advanced   the full per-model form (Suno, the Veo/Runway workflows, Settings) — the upstream
 *                    Kie Studio app (advanced.html → src/), in a frame that stays mounted once opened
 *
 * The lane bar across the top is the nav and shows the Kie credits. Until a Kie API key is saved, a banner
 * under it asks for one (PUT /api/settings/api-key, the same store Advanced → Settings writes).
 */
import { StrictMode, Suspense, lazy, startTransition, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { KeyRound, Wallet } from 'lucide-react'
import '@xyflow/react/dist/style.css'
import '../src/index.css'
import '../theme/plinth.css'
import './studio/studio.css'
import './shell/shell.css'
import './trenchable.css'
import { SURFACES } from './studio/nav.ts'
import { useCredits } from './studio/api.ts'
import { GenerateFrame } from './workspace/GenerateFrame.tsx'
import { KIE_CREDITS_URL } from '../src/lib/kie.ts'

const Studio = lazy(async () => ({ default: (await import('./studio/Studio.tsx')).Studio }))

/** Kie's API key page, carrying the same referral as the sign-up link (src/lib/kie.ts), for anyone who signs up there. */
const KIE_KEY_URL = `https://kie.ai/api-key${new URL(KIE_CREDITS_URL).search}`

/** The lanes: every surface that runs here (the hand-over kinds belong to the app this was taken from). */
const LANES = SURFACES.filter((s) => s.kind === 'kie')

/** `#/gen/video` → `video`; anything else (`#/`, an old link) → '' (Image). */
function laneOf(hash: string): string {
  const m = /^#\/gen\/?([^/?]*)/.exec(hash)
  return m && LANES.some((l) => l.id === m[1]) ? m[1]! : ''
}

function useHash(): string {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => startTransition(() => setHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

/** The Kie balance; a click opens Kie to top up (the same link as Advanced's credit badge, src/lib/kie.ts). */
function Credits() {
  const credits = useCredits()
  return (
    <a className="pl-credits tr-credits" href={KIE_CREDITS_URL} target="_blank" rel="noreferrer" title="Kie credits — top up on Kie.ai">
      <Wallet size={14} />
      <b>{credits == null ? '—' : credits.toLocaleString()}</b> credits
    </a>
  )
}

/** Asks for a Kie API key until one is saved. The key stays on this computer, encrypted (data/). */
function KeyBanner() {
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json() as Promise<{ hasKey?: boolean }>)
      .then((h) => setHasKey(Boolean(h.hasKey)))
      .catch(() => setHasKey(null))
  }, [])
  if (hasKey !== false) return null
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/api-key', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key.trim() }) })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `The server said ${res.status}.`)
      setHasKey(true)
      window.location.reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="tr-key">
      <KeyRound size={16} />
      <span>
        Add your <a href={KIE_KEY_URL} target="_blank" rel="noreferrer">Kie.ai API key</a> to start. It is saved on this computer only, encrypted. No account yet?{' '}
        <a href={KIE_CREDITS_URL} target="_blank" rel="noreferrer">
          Sign up on Kie.ai
        </a>
      </span>
      <input type="password" placeholder="Paste your Kie API key" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && key.trim() && void save()} />
      <button type="button" className="plinth-btn plinth-btn--sm" disabled={busy || !key.trim()} onClick={() => void save()}>
        <span className="plinth-btn__face">
          <span className="plinth-btn__label">{busy ? 'Saving…' : 'Save key'}</span>
        </span>
      </button>
      {error && <span className="tr-key__error">{error}</span>}
    </div>
  )
}

function App() {
  const hash = useHash()
  const lane = laneOf(hash)
  // `#/` and unknown routes land on Image, under the address Studio's own links use.
  useEffect(() => {
    if (!/^#\/gen(\/|$)/.test(hash)) window.location.replace('#/gen')
  }, [hash])

  const advanced = lane === 'advanced'
  const [advancedOpened, setAdvancedOpened] = useState(advanced)
  useEffect(() => {
    if (advanced) setAdvancedOpened(true)
  }, [advanced])

  return (
    <div className="pl-shell">
      <div className="pl-lanebar">
        <span className="pl-lanebar__title">Trenchable</span>
        <nav className="pl-tabs" aria-label="Lanes">
          {LANES.map((l) => (
            <a key={l.id} href={l.id === 'image' ? '#/gen' : `#/gen/${l.id}`} className={`pl-tab ${(lane || 'image') === l.id ? 'is-active' : ''}`} aria-current={(lane || 'image') === l.id ? 'page' : undefined}>
              {l.label}
              {l.badge && <span className="pl-tab__count">{l.badge}</span>}
            </a>
          ))}
        </nav>
        <div className="pl-lanebar__right">
          <Credits />
        </div>
      </div>
      <KeyBanner />
      <div className="pl-content is-tool">
        {advancedOpened && <GenerateFrame active={advanced} className="st-advanced-frame" />}
        <Suspense fallback={null}>
          <Studio route={lane ? `studio/${lane}` : 'studio'} />
        </Suspense>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
