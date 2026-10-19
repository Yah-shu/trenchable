/**
 * Audio's right pane, the way the reference app lists audio: slim rows, newest first, under a date
 * header. A row is a voice swatch (▶ / ❚❚, one clip at a time across the page), the voice
 * and one line of the script, a full-width waveform you can click to seek, the model tag,
 * and ♥ · copy · download · ⋯ (Open, Recreate, Like, Download, Delete).
 *
 * Running and failed jobs take the same row: a spinner in the swatch and a resting waveform
 * while Kie works; "Failed · Credits refunded", the reason in plain words, Retry (with its
 * price), Recreate and Remove when it didn't. Every Audio tab shares one surface, so each
 * feed keeps to the jobs and results of its own tab's models.
 *
 * Voice change and Translate runs are the server's (dub.ts), not Kie tasks: while one runs it
 * takes the same pending row with its phase ("Transcribing", "Voicing 3/8", "Lip-sync"), a
 * failed one offers Retry and Dismiss, and the result is an ordinary history row.
 *
 * RailStudio hands this the whole right pane through its `canvas` prop (AudioSurface.tsx,
 * `AudioRail`); the dub tabs mount it beside their own rail (DubTab.tsx). The Filter is the
 * shared FeedBar, without List/Grid or card size: audio rows keep their shape.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, Copy, Download, Ellipsis, Heart, History as HistoryIcon, Info, ListFilter, Loader2, Maximize2, RotateCcw, Trash2, Wand2, X, type LucideIcon } from 'lucide-react'
import { deleteResult, isDone, mediaUrl, recentFailures, useCatalog, useHistory, type HistoryItem, type MediaAsset, type ModelDefinition } from '../../api.ts'
import { copyText, downloadItems, kindOf, mediaOf, prepareReuse, retryFailed, reuseHandoff, sendReuse, setFavourites, useRegenerate } from '../../actions.ts'
import { useEstimate } from '../../estimate.ts'
import { promptFieldOf } from '../../generator.ts'
import { Sentinel, useIncremental } from '../../incremental.tsx'
import { dismissJob, elapsed, hiddenFailures, isActive, phaseOf, retryJob, useJobs, type Job } from '../../jobs.ts'
import { FeedBar, useFeedPrefs } from '../../FeedBar.tsx'
import { activeFilters, clearFilters, feedDefaults, showFailure, showJob, showResult } from '../../feed.ts'
import { CostTag, Empty, TabBar } from '../../parts.tsx'
import { openViewer } from '../../viewer.ts'
import { swatchOf, voiceName } from '../../voices.ts'
import { dropDub, dubApi, FALLBACK_NOTE, languageLabel, pollDubs, useDubRuns, type DubRun } from './dub.ts'
import { byDay, clockOf, feedEntries, jobInTab, joinNames, modeName, peaksOf, plainReason, rowTitle, scriptOf, tagOf, voicesOf, type Entry } from './feed.ts'
import { inTab, type AudioTab } from './logic.ts'
import { seek, usePlaying, usePosition, useProgress } from './player.ts'
import { VoiceSwatch } from './VoiceModal.tsx'
import { usePeaks, Waveform } from './waveform.tsx'
import './audio.css'

/* ---------- shared bits ---------- */

/** One action at a time on a row; what happened shows on the row, not in an alert. */
function useAct() {
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null)
  const act = (which: string, fn: () => Promise<string | void>) => {
    if (busy) return
    setBusy(which)
    setNote(null)
    fn()
      .then((text) => text && setNote({ bad: false, text }))
      .catch((e: unknown) => setNote({ bad: true, text: (e as Error).message || 'That did not work.' }))
      .finally(() => setBusy(null))
  }
  return { busy, note, act }
}

const spin = <Loader2 size={13} className="st-spin" />

/**
 * Reuse for audio: same tab, model and settings, and the script back in the box. A speech
 * job's script is its `text` field, which history doesn't copy into `prompt`, so it is read
 * from the input when the prompt is blank. The tabs pick the voice and lines up themselves.
 */
async function recreate(item: HistoryItem, models: ModelDefinition[] | null): Promise<string | void> {
  const model = models?.find((m) => m.id === item.modelId) ?? null
  const { handoff, dropped } = await prepareReuse(item, model)
  const field = model ? promptFieldOf(model)?.name : undefined
  const script = field ? item.input?.[field] : undefined
  const prompt = handoff.prompt?.trim() ? handoff.prompt : typeof script === 'string' ? script : handoff.prompt
  sendReuse({ ...handoff, ...(prompt !== undefined ? { prompt } : {}) })
  if (dropped) return `${dropped} attached ${dropped === 1 ? 'file had' : 'files had'} expired on Kie and ${dropped === 1 ? 'was' : 'were'} left out.`
}

/** A queued job as a history row, for Recreate. */
const itemOfJob = (job: Job): HistoryItem => ({
  taskId: job.taskId ?? job.id,
  model: job.modelTitle,
  modelId: job.modelId,
  category: job.category,
  provider: job.provider,
  operation: job.operation,
  state: 'fail',
  createdAt: job.startedAt,
  prompt: job.prompt,
  input: job.input,
})

function useTick(on: boolean) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!on) return
    const t = window.setInterval(() => set((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [on])
}

function RowShell({ swatch, name, script, middle, tail, state, note }: { swatch: ReactNode; name: string; script: string; middle: ReactNode; tail: ReactNode; state?: 'pending' | 'failed'; note?: { bad: boolean; text: string } | null }) {
  return (
    <div className={`au-row ${state ? `is-${state}` : ''}`} role="listitem">
      {swatch}
      <div className="au-row-text">
        <span className="au-row-name" title={name}>
          {name}
        </span>
        <span className="au-row-script" title={script}>
          {script || '—'}
        </span>
      </div>
      <div className="au-row-mid">{middle}</div>
      <div className="au-row-tail">{tail}</div>
      {note && (
        <p className={`au-row-note ${note.bad ? 'is-bad' : ''}`} role={note.bad ? 'alert' : 'status'}>
          {note.text}
        </p>
      )}
    </div>
  )
}

/** The model tag: the model's own name (feed.ts tagOf), with a tool's long label kept as the tooltip. */
function Tag({ title, modelId }: { title?: string; modelId?: string }) {
  const { models } = useCatalog()
  const { tag, tip } = tagOf(modelId, title, models)
  return tag ? (
    <span className="pl-badge pl-badge--quiet au-tag" title={tip}>
      {tag}
    </span>
  ) : null
}

/** A dub that ElevenLabs could not voice says so on its row (server/studio/dub.ts falls back to Gemini). */
const fallbackNote = (on: unknown) => (on ? { bad: false, text: FALLBACK_NOTE } : null)

/* ---------- a finished take ---------- */

function RowMenu({ item, list, a }: { item: HistoryItem; list: HistoryItem[]; a: ReturnType<typeof useAct> }) {
  const { models } = useCatalog()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: globalThis.MouseEvent) => {
      if (box.current?.contains(e.target as Node)) return
      setOpen(false)
      setConfirm(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  const run = (which: string, fn: () => Promise<string | void>) => {
    setOpen(false)
    setConfirm(false)
    a.act(which, fn)
  }
  return (
    <span className="au-menu-anchor" ref={box}>
      <button type="button" className="pl-iconbtn is-quiet au-mini" aria-label="More actions" title="More" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {a.busy === 'recreate' || a.busy === 'delete' ? spin : <Ellipsis size={14} />}
      </button>
      {open && (
        <span className="au-menu" role="menu" aria-label="Actions">
          <button type="button" role="menuitem" onClick={() => (setOpen(false), openViewer(item, list))}>
            <Maximize2 size={13} /> Open
          </button>
          <button type="button" role="menuitem" title="Load the script, voice and settings back into the rail" onClick={() => run('recreate', () => recreate(item, models))}>
            <Wand2 size={13} /> Recreate
          </button>
          <button type="button" role="menuitem" onClick={() => run('fav', () => setFavourites([item], !item.pinned))}>
            <Heart size={13} /> {item.pinned ? 'Unlike' : 'Like'}
          </button>
          <button type="button" role="menuitem" onClick={() => run('down', () => downloadItems([item]))}>
            <Download size={13} /> Download
          </button>
          {confirm ? (
            <button type="button" role="menuitem" className="is-bad" onClick={() => run('delete', () => deleteResult(item.taskId))}>
              <Trash2 size={13} /> Delete for good?
            </button>
          ) : (
            <button type="button" role="menuitem" onClick={() => setConfirm(true)}>
              <Trash2 size={13} /> Delete
            </button>
          )}
        </span>
      )}
    </span>
  )
}

function DoneRow({ item, media, list }: { item: HistoryItem; media?: MediaAsset; list: HistoryItem[] }) {
  const url = media ? mediaUrl(media) : undefined
  // Some providers send the loudness curve with the file; then nothing needs decoding.
  const given = useMemo(() => (media?.waveform?.length ? { bars: peaksOf([media.waveform]), duration: media.duration ?? 0 } : null), [media])
  const decoded = usePeaks(url, !given)
  const peaks = given ?? decoded
  const progress = useProgress(url)
  const position = usePosition(url)
  const playing = usePlaying(url)
  const a = useAct()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(t)
  }, [copied])
  const name = rowTitle(item.input, item, media)
  const script = scriptOf(item.input, item.prompt)
  const duration = media?.duration ?? peaks?.duration
  const middle = url ? (
    <>
      <Waveform peaks={peaks} progress={progress} onSeek={(at) => seek(url, at)} label={`Seek in ${name}`} />
      <span className="au-row-time">
        {playing || position > 0 ? `${clockOf(position)} / ` : ''}
        {clockOf(duration)}
      </span>
    </>
  ) : (
    <span className="au-row-only">{script || 'No audio in this result.'}</span>
  )
  return (
    <RowShell
      swatch={<VoiceSwatch name={name} url={url} />}
      name={name}
      script={script}
      middle={middle}
      note={a.note ?? fallbackNote(item.input?.tts_fallback)}
      tail={
        <>
          <Tag title={item.model} modelId={item.modelId} />
          <button type="button" className={`pl-iconbtn is-quiet au-mini ${item.pinned ? 'is-liked' : ''}`} aria-pressed={Boolean(item.pinned)} aria-label={item.pinned ? 'Unlike' : 'Like'} title={item.pinned ? 'Unlike' : 'Like'} onClick={() => a.act('fav', () => setFavourites([item], !item.pinned))}>
            {a.busy === 'fav' ? spin : <Heart size={13} />}
          </button>
          {script && (
            <button type="button" className="pl-iconbtn is-quiet au-mini" aria-label="Copy script" title={copied ? 'Copied' : 'Copy script'} onClick={() => a.act('copy', () => copyText(scriptOf(item.input, item.prompt)).then(() => setCopied(true)))}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          )}
          <button type="button" className="pl-iconbtn is-quiet au-mini" aria-label="Download" title="Download" onClick={() => a.act('down', () => downloadItems([item]))}>
            {a.busy === 'down' ? spin : <Download size={13} />}
          </button>
          <RowMenu item={item} list={list} a={a} />
        </>
      }
    />
  )
}

/* ---------- on its way ---------- */

/** A resting waveform while Kie works. */
const RESTING = { bars: Array.from({ length: 120 }, (_, i) => 0.18 + 0.14 * Math.abs(Math.sin(i / 4))), duration: 0 }

function PendingRow({ job }: { job: Job }) {
  useTick(true)
  const name = joinNames(voicesOf(job.input)) || modeName({ modelId: job.modelId, provider: job.provider })
  // Kie's own state, as the queue keeps it: Queued while it waits, Generating once it runs.
  const phase = phaseOf(job)
  const state = phase === 'sending' ? 'Sending…' : phase === 'queued' ? 'Queued' : 'Generating'
  const pct = typeof job.progress === 'number' && job.progress > 0 && job.progress < 1 ? ` · ${Math.round(job.progress * 100)}%` : ''
  return (
    <RowShell
      state="pending"
      swatch={
        <span className="au-swatch is-busy" style={{ background: swatchOf(name) }} aria-label="Generating">
          <Loader2 size={16} className="st-spin" />
        </span>
      }
      name={name}
      script={scriptOf(job.input, job.prompt)}
      middle={
        <>
          <div className="au-wave-rest">
            <Waveform peaks={RESTING} progress={0} />
          </div>
          <span className="au-row-time">
            {state} · {clockOf(elapsed(job))}
            {pct}
          </span>
        </>
      }
      tail={<Tag title={job.modelTitle} modelId={job.modelId} />}
    />
  )
}

/* ---------- failed ---------- */

function FailNote({ reason, refunded }: { reason?: string; refunded: boolean }) {
  return (
    <span className="au-row-fail">
      <span className="pl-badge pl-badge--bad">{refunded ? 'Failed · Credits refunded' : 'Failed'}</span>
      <span className="au-row-reason" title={reason}>
        {plainReason(reason)}
      </span>
    </span>
  )
}

function FailedJobRow({ job }: { job: Job }) {
  const { models } = useCatalog()
  const model = models?.find((m) => m.id === job.modelId) ?? null
  const estimate = useEstimate(model, job.input, 1)
  const a = useAct()
  const name = joinNames(voicesOf(job.input)) || modeName({ modelId: job.modelId, provider: job.provider })
  return (
    <RowShell
      state="failed"
      swatch={
        <span className="au-swatch is-failed" aria-label="Failed">
          <AlertTriangle size={16} />
        </span>
      }
      name={name}
      script={scriptOf(job.input, job.prompt)}
      middle={<FailNote reason={job.error} refunded={!job.task?.creditsConsumed} />}
      note={a.note}
      tail={
        <>
          <Tag title={job.modelTitle} modelId={job.modelId} />
          <button type="button" className="st-pill au-pill" disabled={!models} title={estimate?.detail ?? 'Send the same job again'} onClick={() => models && retryJob(job.id, models)}>
            <RotateCcw size={13} /> Retry
            {estimate && <CostTag credits={estimate.credits} />}
          </button>
          <button type="button" className="pl-iconbtn is-quiet au-mini" title="Recreate: load it back into the rail" aria-label="Recreate" onClick={() => a.act('recreate', async () => sendReuse(reuseHandoff(itemOfJob(job))))}>
            <Wand2 size={13} />
          </button>
          <button type="button" className="pl-iconbtn is-quiet au-mini" title="Dismiss" aria-label="Dismiss" onClick={() => dismissJob(job.id)}>
            <X size={13} />
          </button>
        </>
      }
    />
  )
}

function FailedItemRow({ item }: { item: HistoryItem }) {
  const { models } = useCatalog()
  const { model, blocker, estimate } = useRegenerate(item)
  const [confirm, setConfirm] = useState(false)
  const a = useAct()
  const name = rowTitle(item.input, item)
  return (
    <RowShell
      state="failed"
      swatch={
        <span className="au-swatch is-failed" aria-label="Failed">
          <AlertTriangle size={16} />
        </span>
      }
      name={name}
      script={scriptOf(item.input, item.prompt)}
      middle={<FailNote reason={item.failMsg} refunded={!item.creditsConsumed} />}
      note={a.note}
      tail={
        confirm ? (
          <>
            <button type="button" className="st-pill au-pill" onClick={() => setConfirm(false)} disabled={a.busy === 'remove'}>
              Keep
            </button>
            <button type="button" className="st-pill au-pill" onClick={() => a.act('remove', () => deleteResult(item.taskId))} disabled={Boolean(a.busy)}>
              {a.busy === 'remove' ? spin : <Trash2 size={13} />} Remove
            </button>
          </>
        ) : (
          <>
            <Tag title={item.model} modelId={item.modelId} />
            <button
              type="button"
              className="st-pill au-pill"
              disabled={!model || Boolean(blocker) || Boolean(a.busy)}
              title={blocker ?? estimate?.detail ?? 'Run the same job again'}
              onClick={() =>
                model &&
                a.act('retry', async () => {
                  // The old row is settled (jobs.ts), so it leaves the feed for the new job's row.
                  await retryFailed(item, model)
                  return 'Sent again.'
                })
              }
            >
              {a.busy === 'retry' ? spin : <RotateCcw size={13} />} Retry
              {estimate && <CostTag credits={estimate.credits} />}
            </button>
            <button type="button" className="pl-iconbtn is-quiet au-mini" title="Recreate: load it back into the rail" aria-label="Recreate" onClick={() => a.act('recreate', () => recreate(item, models))}>
              {a.busy === 'recreate' ? spin : <Wand2 size={13} />}
            </button>
            <button type="button" className="pl-iconbtn is-quiet au-mini" title="Remove from history" aria-label="Remove" onClick={() => setConfirm(true)} disabled={Boolean(a.busy)}>
              <Trash2 size={13} />
            </button>
          </>
        )
      }
    />
  )
}

/* ---------- a dub the server is working on ---------- */

/** The voice that is speaking it: after a switch to Gemini, the backup voice. */
const dubName = (run: DubRun) => voiceName(run.voicedWith?.voice ?? (run.fallback ? (run.request.fallbackVoice ?? 'Kore') : run.request.voice)) || 'Voice'
const dubScript = (run: DubRun) =>
  (run.segments ?? []).map((s) => s.line ?? s.text).join(' ') || [run.request.mode === 'translate' ? `To ${languageLabel(run.request.language)}` : 'New voice', run.request.name].filter(Boolean).join(' · ')
const dubTag = (run: DubRun) => (run.request.mode === 'translate' ? 'Translate' : 'Voice change')

function DubPendingRow({ run }: { run: DubRun }) {
  useTick(true)
  const name = dubName(run)
  return (
    <RowShell
      state="pending"
      swatch={
        <span className="au-swatch is-busy" style={{ background: swatchOf(name) }} aria-label={run.step}>
          <Loader2 size={16} className="st-spin" />
        </span>
      }
      name={name}
      script={dubScript(run)}
      middle={
        <>
          <div className="au-wave-rest">
            <Waveform peaks={RESTING} progress={0} />
          </div>
          <span className="au-row-time">
            {run.step} · {clockOf(Math.max(0, Math.round((Date.now() - run.createdAt) / 1000)))}
          </span>
        </>
      }
      note={fallbackNote(run.fallback)}
      tail={<Tag title={dubTag(run)} />}
    />
  )
}

function DubFailedRow({ run }: { run: DubRun }) {
  const a = useAct()
  const name = dubName(run)
  return (
    <RowShell
      state="failed"
      swatch={
        <span className="au-swatch is-failed" aria-label="Failed">
          <AlertTriangle size={16} />
        </span>
      }
      name={name}
      script={dubScript(run)}
      middle={
        <span className="au-row-fail">
          {/* Lines already voiced were charged, so no "Credits refunded" here. */}
          <span className="pl-badge pl-badge--bad">{run.credits > 0 ? `Failed · ${run.credits} credits used` : 'Failed'}</span>
          <span className="au-row-reason" title={run.error}>
            {plainReason(run.error)}
          </span>
        </span>
      }
      note={a.note}
      tail={
        <>
          <Tag title={dubTag(run)} />
          <button
            type="button"
            className="st-pill au-pill"
            disabled={Boolean(a.busy)}
            title="Run the same dub again"
            onClick={() =>
              a.act('retry', async () => {
                await dubApi.retry(run.id)
                dropDub(run.id)
                await pollDubs()
              })
            }
          >
            {a.busy === 'retry' ? spin : <RotateCcw size={13} />} Retry
          </button>
          <button
            type="button"
            className="pl-iconbtn is-quiet au-mini"
            title="Dismiss"
            aria-label="Dismiss"
            onClick={() =>
              a.act('dismiss', async () => {
                await dubApi.dismiss(run.id)
                dropDub(run.id)
              })
            }
          >
            <X size={13} />
          </button>
        </>
      }
    />
  )
}

/* ---------- the feed ---------- */

/** Every audio file a result holds (Suno makes two takes per job), each its own row. */
const audioMedia = (item: HistoryItem): MediaAsset[] => mediaOf(item).filter((m) => kindOf(item, m) === 'audio')

function EntryRows({ e, done }: { e: Entry; done: HistoryItem[] }) {
  if (e.kind === 'dub') return e.run.status === 'running' ? <DubPendingRow run={e.run} /> : <DubFailedRow run={e.run} />
  if (e.kind === 'job') return isActive(e.job) ? <PendingRow job={e.job} /> : <FailedJobRow job={e.job} />
  if (e.kind === 'failed') return <FailedItemRow item={e.item} />
  const files = audioMedia(e.item)
  if (!files.length) return <DoneRow item={e.item} list={done} />
  return (
    <>
      {files.map((m, i) => (
        <DoneRow key={i} item={e.item} media={m} list={done} />
      ))}
    </>
  )
}

export interface AudioFeedProps {
  tab: AudioTab
  empty: { icon: LucideIcon; title: string; sub?: string }
  explain?: ReactNode
}

export function AudioFeed({ tab, empty, explain }: AudioFeedProps) {
  const dubTab = tab === 'change' || tab === 'translate'
  // A dubbed video is a video result, so those tabs read every category.
  const { items } = useHistory(dubTab ? undefined : 'audio')
  const jobs = useJobs()
  const dubs = useDubRuns(dubTab).filter((r) => r.request.mode === tab)
  const [view, setView] = useState<'history' | 'how'>('history')
  const [prefs, setPrefs] = useFeedPrefs('audio', feedDefaults('audio'))
  const feedItems = useMemo(() => (items ?? []).filter((i) => inTab(tab, i)), [items, tab])
  const queued = jobs.filter((j) => j.meta.surface === 'audio' && (isActive(j) || j.status === 'error') && jobInTab(tab, j))
  const mine = queued.filter((j) => showJob(j, prefs))
  const done = feedItems.filter((i) => isDone(i) && showResult(i, prefs))
  // Minus the rows a live job already shows, and the ones retried or dismissed (jobs.ts).
  const failed = recentFailures(feedItems, hiddenFailures(jobs)).filter((i) => showFailure(i, prefs))
  const shownDubs = dubs.filter((r) => r.status === 'running' || !prefs.hideFailed)
  const entries = feedEntries(mine, failed, done, shownDubs)
  const page = useIncremental(entries, 30)
  const running = mine.filter(isActive).length + dubs.filter((r) => r.status === 'running').length
  const filteredOut = activeFilters(prefs) > 0 && !entries.length && (queued.length > 0 || feedItems.length > 0 || dubs.length > 0)
  return (
    <section className="st-canvas au-canvas">
      <div className="st-canvas-bar">
        <TabBar
          tabs={[
            { id: 'history' as const, label: 'History' },
            { id: 'how' as const, label: 'How it works' },
          ]}
          value={view}
          onPick={setView}
        />
        <span className="st-canvas-tools">
          {running > 0 && <span className="st-pill-label">{running} running</span>}
          {view === 'history' && <FeedBar prefs={prefs} onChange={setPrefs} items={feedItems} layouts={false} sizable={false} />}
        </span>
      </div>
      <div className="st-canvas-body">
        {view === 'how' ? (
          (explain ?? <Empty icon={Info} title="How it works" sub="Fill in the rail on the left and generate. Results land in History and in Assets." />)
        ) : filteredOut ? (
          <Empty
            icon={ListFilter}
            title="Nothing matches the filter"
            sub="Widen the models, the dates or the toggles to see the rest."
            cta={
              <button type="button" className="vw-btn is-sm" onClick={() => setPrefs(clearFilters(prefs))}>
                Clear filters
              </button>
            }
          />
        ) : entries.length ? (
          <div className="au-feed">
            {byDay(page.shown, (e) => e.at).map((g) => (
              <section key={g.day} className="au-day" aria-label={g.day}>
                <h3 className="au-day-head">{g.day}</h3>
                <div className="au-rows" role="list">
                  {g.items.map((e) => (
                    <EntryRows key={e.key} e={e} done={done} />
                  ))}
                </div>
              </section>
            ))}
            {page.more && <Sentinel count={page.shown.length} onSeen={page.grow} />}
          </div>
        ) : (
          <Empty icon={items ? empty.icon : HistoryIcon} title={empty.title} sub={empty.sub} />
        )}
      </div>
    </section>
  )
}
