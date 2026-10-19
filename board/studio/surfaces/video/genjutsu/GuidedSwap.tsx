/**
 * Genjutsu → Guided swap: the third tab, next to Motion transfer and Objects swap. Instead of
 * sending raw footage, the clip is turned into a guide on this PC — the person as a coloured depth map over
 * the original background, a face mesh on top, the voice pitched +3 semitones inside — and Seedance 2.5
 * redraws that figure as your character (server/studio/guided.ts, a port of the MIT
 * github.com/sirioberati/Genjustsu-Open-Source-Workflow).
 *
 *   1  Clip (4–15 s, with its sound) + character pictures + click on the person in frame 0
 *   2  Prepare guide — free, local. The guide and the mask preview show side by side.
 *   3  Approve guide — the gate: nothing on Kie runs until you approve exactly these files (their fingerprint);
 *      changing the clicks or Face outline and preparing again clears it.
 *   4  Make draft — Seedance 2.5 draft mode, 480p, the price on the button. The clip's original sound is put back.
 *   5  Make HD — the same take finished at 1080p (Seedance's own draft finish), the price on the button.
 *
 * Its own rail rather than a RailStudio: the job is a pipeline on the server, not one Kie model's form.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ImagePlus, Loader2, ShieldCheck, X } from 'lucide-react'
import { firstMedia, useHistory, type HistoryItem } from '../../../api.ts'
import { uploadMedia } from '../../../library.ts'
import { GoButton, TabBar } from '../../../parts.tsx'
import { usePricing } from '../../../pricing.ts'
import { RailCanvas } from '../../../RailStudio.tsx'
import { ClickSelect, ClipPick, EMPTY_SELECTION, hasSubject, useClipSeconds, type Clip, type Selection } from '../ClickSelect.tsx'
import { RunRow } from '../LocalTools.tsx'
import { Hint, How } from '../ModeBar.tsx'
import { GUIDED_MODEL_ID, guidedCost, guidedRuns, localApi, notReady, useDoctor, type GuidedRun } from '../localtools.ts'
import '../localtools.css'

const RUN_KEY = 'studio.video.guided.run'
const MAX_PICS = 8
const NEEDS = ['audio', 'depth', 'segment', 'facemesh', 'guide']

const loadRunId = () => {
  try {
    return window.localStorage.getItem(RUN_KEY)
  } catch {
    return null
  }
}
const saveRunId = (id: string | null) => {
  try {
    if (id) window.localStorage.setItem(RUN_KEY, id)
    else window.localStorage.removeItem(RUN_KEY)
  } catch {
    // Storage off: the open run is not remembered across reloads.
  }
}

const sameSelection = (run: GuidedRun | null, sel: Selection, face: boolean) =>
  Boolean(run) && JSON.stringify(run!.request.points.map(({ x, y, label }) => ({ x, y, label }))) === JSON.stringify(sel.points.map(({ x, y, label }) => ({ x, y, label }))) && JSON.stringify(run!.request.box ?? null) === JSON.stringify(sel.box ?? null) && run!.request.faceOutline === face

function Pictures({ value, onChange }: { value: { url: string; thumb: string }[]; onChange: (v: { url: string; thumb: string }[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const add = async (files: FileList) => {
    setBusy(true)
    setError(null)
    try {
      const next = [...value]
      for (const f of Array.from(files).slice(0, MAX_PICS - value.length)) {
        const up = await uploadMedia(f)
        next.push({ url: up.fileUrl, thumb: URL.createObjectURL(f) })
      }
      onChange(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="lt-opt">
      <span className="st-field-label">Your character</span>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => e.target.files && void add(e.target.files)} />
      <div className="gs-pics">
        {value.map((p, i) => (
          <span key={p.url} className="gs-pic" title={`@image${i + 1}`}>
            <img src={p.thumb} alt={`Character picture ${i + 1}`} />
            <button type="button" className="gj-x" aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <X size={11} />
            </button>
          </span>
        ))}
        {value.length < MAX_PICS && (
          <button type="button" className="gs-pic" onClick={() => input.current?.click()} disabled={busy} aria-label="Add a character picture">
            {busy ? <Loader2 size={16} className="lt-spin" /> : <ImagePlus size={16} />}
          </button>
        )}
      </div>
      {error ? <Hint warn>{error}</Hint> : <Hint>The first is @image1, the main reference; more angles of the same person help. Clear, front-facing, the whole head and hair.</Hint>}
    </div>
  )
}

export function GuidedSwap({ header }: { header: ReactNode }) {
  const [clip, setClip] = useState<Clip | null>(null)
  const [pics, setPics] = useState<{ url: string; thumb: string }[]>([])
  const [sel, setSel] = useState<Selection>(EMPTY_SELECTION)
  const [face, setFace] = useState(true)
  const [prompt, setPrompt] = useState('')
  const [runId, setRunId] = useState<string | null>(loadRunId)
  const [tab, setTab] = useState<'guide' | 'history'>('guide')
  const [error, setError] = useState<string | null>(null)
  const runs = guidedRuns.use()
  const run = runs.find((r) => r.id === runId) ?? null
  const doc = useDoctor()
  const pricing = usePricing()
  const { items } = useHistory('video')
  const seconds = useClipSeconds(clip?.url) ?? run?.seconds ?? null
  useEffect(() => saveRunId(runId), [runId])

  // A run from before a reload brings its clip and clicks back.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current || !run || clip) return
    restored.current = true
    setClip({ url: run.request.clipUrl, name: run.request.name })
    setPics(run.request.images.map((url) => ({ url, thumb: url })))
    setSel({ points: run.request.points, box: run.request.box ?? null })
    setFace(run.request.faceOutline)
    setPrompt(run.request.prompt ?? '')
  }, [run, clip])

  const pickClip = (c: Clip | null) => {
    setClip(c)
    setSel(EMPTY_SELECTION)
    if (run && c?.url !== run.request.clipUrl) setRunId(null)
  }

  const missing = notReady(doc, face ? NEEDS : NEEDS.filter((t) => t !== 'facemesh'))
  const lengthProblem = seconds !== null && (seconds < 3.9 || seconds > 15.25) ? `A guided swap takes clips of 4–15 s; this one is ${seconds.toFixed(1)} s. Trim it first.` : null
  const stale = run && run.request.clipUrl === clip?.url && !sameSelection(run, sel, face)
  const draftCost = pricing && seconds ? guidedCost(pricing.rows, seconds, '480p') : null
  const hdCost = pricing && seconds ? guidedCost(pricing.rows, seconds, '1080p') : null
  const itemOf = (id?: string) => (id ? items?.find((i) => i.taskId === id) ?? null : null)
  const draftItem = itemOf(run?.draft?.taskId)
  const hdItem = itemOf(run?.hd?.taskId)

  const act = async (f: () => Promise<GuidedRun>) => {
    setError(null)
    try {
      const r = await f()
      setRunId(r.id)
      guidedRuns.put(r)
      setTab('guide')
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const prepare = () =>
    void act(() =>
      run && run.request.clipUrl === clip!.url
        ? localApi.guided.prepare(run.id, { points: sel.points, box: sel.box, faceOutline: face })
        : localApi.guided.start({ clipUrl: clip!.url, name: clip!.name, images: pics.map((p) => p.url), points: sel.points, ...(sel.box ? { box: sel.box } : {}), faceOutline: face, prompt }),
    )
  const approve = () => run?.prepared && void act(() => localApi.guided.approve(run.id, run.prepared!.fingerprint))
  const draft = () => run && void act(() => localApi.guided.draft(run.id, { prompt, ...(pics.length ? { images: pics.map((p) => p.url) } : {}) }))
  const hd = () => run && void act(() => localApi.guided.hd(run.id))

  // What the one button does now, and why it can't.
  const busy = run?.status === 'running'
  const approved = Boolean(run?.approved && run.prepared && run.approved.fingerprint === run.prepared.fingerprint) && !stale
  const stage: 'prepare' | 'approve' | 'draft' | 'hd' | 'done' = !run || stale || !run.prepared ? 'prepare' : !approved ? 'approve' : !run.draft?.taskId ? 'draft' : !run.hd?.taskId ? 'hd' : 'done'
  const blocker = !clip
    ? 'Add your clip first.'
    : lengthProblem ?? (stage === 'prepare' ? missing ?? (!hasSubject(sel) ? 'Click on the person to replace in frame 0 (right).' : null) : stage === 'approve' ? 'Look at the guide and the mask on the right, then press Approve guide.' : stage === 'draft' && !pics.length && !run?.request.images.length ? 'Add a picture of your character.' : null)

  const go =
    stage === 'prepare' ? (
      <GoButton label={run?.prepared && stale ? 'Prepare again (free)' : 'Prepare guide (free)'} credits={null} disabled={Boolean(blocker) || busy} busy={busy && run?.action === 'prepare'} wide onClick={prepare} />
    ) : stage === 'approve' ? (
      <GoButton label="Make draft · 480p" credits={draftCost?.credits ?? null} disabled wide onClick={() => undefined} />
    ) : stage === 'draft' ? (
      <GoButton
        label="Make draft · 480p"
        credits={draftCost?.credits ?? null}
        title={draftCost ? `About ${draftCost.credits} credits — Seedance 2.5 with a reference video at 480p, ${draftCost.perSecond} cr/s × ${draftCost.billed} s (Kie bills the ${draftCost.seconds} s guide and the ${draftCost.seconds} s it makes)` : undefined}
        disabled={Boolean(blocker) || busy}
        busy={busy}
        wide
        onClick={draft}
      />
    ) : stage === 'hd' ? (
      <GoButton
        label="Make HD · 1080p"
        credits={hdCost?.credits ?? null}
        title={hdCost ? `About ${hdCost.credits} credits at most — Kie lists no price for finishing a draft; this is Seedance 2.5's 1080p rate billed like the draft, ${hdCost.perSecond} cr/s × ${hdCost.billed} s (guide + output)` : undefined}
        disabled={busy}
        busy={busy}
        wide
        onClick={hd}
      />
    ) : (
      <GoButton label="Done — in History" credits={null} disabled wide onClick={() => undefined} />
    )

  const rail = (
    <aside className="st-rail">
      {header}
      <ClipPick value={clip} onChange={pickClip} sub="4–15 s, one person, with its sound" />
      <Pictures value={pics} onChange={setPics} />
      <div className="gj-line">
        <span className="gj-line-label">Face outline</span>
        <span className="gj-line-value">{face ? 'On' : 'Off'}</span>
        <button type="button" role="switch" aria-checked={face} aria-label="Face outline" className={`st-switch ${face ? 'is-on' : ''}`} onClick={() => setFace((v) => !v)}>
          <span />
        </button>
      </div>
      <Hint>Draws a face mesh into the guide so Seedance follows the expressions and the lips.</Hint>
      <div className="lt-opt">
        <span className="st-field-label">Add to the instruction (optional)</span>
        <textarea className="gs-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. 'She wears a navy linen shirt.' — the replace / keep-the-motion instruction is already sent." />
      </div>
      <div className="gs-steps">
        {(['prepare', 'approve', 'draft', 'hd'] as const).map((s, i) => (
          <span key={s}>{stage === s ? <b>{`${i + 1} ${STEP_NAME[s]}`}</b> : `${i + 1} ${STEP_NAME[s]}`}</span>
        ))}
      </div>
      {run && (run.status === 'running' || run.status === 'failed') && (
        <RunRow run={run} onRetry={() => void act(() => localApi.guided.retry(run.id))} onDismiss={() => void localApi.guided.dismiss(run.id).then(() => (guidedRuns.drop(run.id), setRunId(null)))} />
      )}
      <div className="st-rail-foot">
        {(error || (clip && blocker)) && <p className="st-note">{error ?? blocker}</p>}
        <p className="lt-where">{stage === 'prepare' || stage === 'approve' ? 'Prepare runs on your PC · free. Nothing goes to Kie until you approve the guide.' : 'Runs on Kie · Seedance 2.5'}</p>
        <div className="st-rail-go">{go}</div>
      </div>
    </aside>
  )

  const review = run?.prepared && !stale && (
    <div className="gs-review">
      <div className="gs-pair">
        <figure>
          <figcaption>Guide — what Seedance gets as @video1</figcaption>
          <video className="lt-video" src={run.prepared.guide} controls loop playsInline />
        </figure>
        <figure>
          <figcaption>Mask — the person it replaces{typeof run.prepared.coverage === 'number' ? ` (${Math.round(run.prepared.coverage * 100)}% of the frame)` : ''}</figcaption>
          <video className="lt-video" src={run.prepared.mask} controls loop muted playsInline autoPlay />
        </figure>
      </div>
      <div className={`gs-gate ${approved ? 'is-ok' : ''}`}>
        {approved ? <ShieldCheck size={16} /> : <Check size={16} />}
        <span>
          {approved
            ? `Approved — this exact guide (fingerprint ${run.approved!.fingerprint.slice(0, 10)}…) is what the draft sends. Change the clicks or Face outline and it must be prepared and approved again.`
            : 'Play the whole guide: the figure should be fully coloured, nothing else, and the face mesh on the face. Then approve — the approval holds only for these files.'}
        </span>
        {!approved && (
          <button type="button" className="plinth-btn plinth-btn--sm" onClick={approve} disabled={busy}>
            <span className="plinth-btn__face">
              <span className="plinth-btn__label">Approve guide</span>
            </span>
          </button>
        )}
      </div>
      {(draftItem || hdItem) && (
        <div className="gs-pair">
          {draftItem && <Result item={draftItem} caption="Draft · 480p, original sound" />}
          {hdItem && <Result item={hdItem} caption="HD · 1080p, original sound" />}
        </div>
      )}
    </div>
  )

  const canvasBody =
    tab === 'history' || !clip ? null : (
      <div className="st-canvas-body lt-canvas">
        {review || (
          <ClickSelect
            clipUrl={clip.url}
            value={sel}
            onChange={setSel}
            title="Click on the person to replace"
            aside={
              <div className="lt-preview">
                <span className="st-field-label">Then</span>
                <Hint>Prepare guide (left) makes the depth guide, the mask and the face outline on your PC — free — and shows them here for you to approve.</Hint>
                {run?.prepared && stale && (
                  <p className="st-note">
                    You changed the clicks or Face outline since the last guide. Prepare again; the old approval no longer counts.
                  </p>
                )}
              </div>
            }
          />
        )}
        {review && (
          <button type="button" className="vw-btn is-sm" onClick={() => setSel({ points: [], box: null })} disabled={busy}>
            Change the selection
          </button>
        )}
      </div>
    )

  return (
    <div className="st-split">
      {rail}
      {canvasBody ? (
        <section className="st-canvas">
          <div className="st-canvas-bar">
            <TabBar
              tabs={[
                { id: 'guide' as const, label: 'Guide' },
                { id: 'history' as const, label: 'History' },
              ]}
              value={tab}
              onPick={setTab}
            />
          </div>
          {canvasBody}
        </section>
      ) : (
        <RailCanvas surface="genjutsu" category="video" historyFilter={byGuided} emptyTitle="No guided swaps yet" emptySub="Add a clip on the left, click on the person, and prepare the guide." explain={EXPLAIN} />
      )}
    </div>
  )
}

const byGuided = (i: HistoryItem) => i.modelId === GUIDED_MODEL_ID

const STEP_NAME = { prepare: 'Prepare', approve: 'Approve', draft: 'Draft 480p', hd: 'HD 1080p' } as const

function Result({ item, caption }: { item: HistoryItem; caption: string }) {
  const src = useMemo(() => firstMedia(item), [item])
  return (
    <figure>
      <figcaption>{caption}</figcaption>
      {src ? <video className="lt-video" src={src} controls loop playsInline /> : <p className="st-hint">Saved to History.</p>}
    </figure>
  )
}

const EXPLAIN = (
  <How
    title="Guided swap"
    steps={[
      'Add a 4–15 s clip with one person and its sound, and pictures of your character.',
      'Click on the person in frame 0. Prepare guide (free, on your PC): depth, a mask, a face outline and the voice pitched +3 semitones, put together into one guide video.',
      'Look at the guide and the mask side by side, and Approve guide. The approval is tied to those exact files.',
      'Make draft: Seedance 2.5 redraws the figure as your character at 480p; the clip’s original sound is put back on it.',
      'Make HD: the same take, finished at 1080p, the sound restored again.',
    ]}
    foot="After the open-source Genjutsu workflow by Sirio Berati (MIT). Seedance gets a guide instead of raw footage, so the motion, framing and lips hold while the person changes."
  />
)
