/**
 * Marketing — their Marketing Studio: pick your product (a saved product Element or a
 * one-off upload), optionally a person to show it, then a template — product shot, UGC,
 * unboxing, before/after, testimonial, poster, marketplace listing, TV spot, social ad —
 * for a still or a clip. Your results collect underneath.
 *
 * Picking a template does not run anything. It writes the recipe into the composer with
 * your product and person named in it, attaches their pictures as references (product
 * first) and locks the template's format (aspect, length); you can still edit the prompt
 * before spending a credit.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutTemplate, Package, Upload, UserRound, X } from 'lucide-react'
import { Composer } from '../Composer.tsx'
import { useHistory, type ModelCategory, type Ref } from '../api.ts'
import { useJobs } from '../jobs.ts'
import { type Element, elementRefs, libraryApi, uploadMedia, useElements } from '../library.ts'
import { Chips, Empty, Hero, SectionHead } from '../parts.tsx'
import { indexHistory, lockedLabels, presetTag } from '../presets.ts'
import { AddTile, ElementChooser, PresetGrid, QuietBtn, ResultsGrid } from './pageParts.tsx'
import { trackJobs, useTracked } from './track.ts'
import { fillTemplate, filterTemplates, MARKETING_GROUPS, MARKETING_TAG, MARKETING_TEMPLATES, marketingKind, marketingLabel, type MarketingGroup, type MarketingTemplate } from './marketing/templates.ts'
import './studio-pages.css'

type Kind = 'all' | 'image' | 'video'

const KINDS: { id: Kind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
]

/** A product picked for this session only: uploaded, hosted for Kie, not saved to the library. */
interface OneOff {
  url: string
  name: string
  /** Kept so "Save to Elements" can copy the original rather than Kie's copy. */
  file: File
}

export function MarketingSurface() {
  const { items: elements } = useElements()
  const [productId, setProductId] = useState<string | null>(null)
  const [upload, setUpload] = useState<OneOff | null>(null)
  const [avatarId, setAvatarId] = useState<string | null>(null)
  const [group, setGroup] = useState<MarketingGroup | 'all'>('all')
  const [kind, setKind] = useState<Kind>('all')
  const [chosen, setChosen] = useState<MarketingTemplate | null>(null)
  const [brief, setBrief] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const top = useRef<HTMLDivElement>(null)

  const product = elements.find((el) => el.id === productId) ?? null
  const avatar = elements.find((el) => el.id === avatarId) ?? null
  const shown = useMemo(() => filterTemplates(MARKETING_TEMPLATES, group, kind), [group, kind])

  const mine = useTracked(MARKETING_TAG)
  const { items: history } = useHistory()
  const byTask = useMemo(() => indexHistory(history), [history])
  const results = useMemo(() => mine.flatMap((t) => byTask.get(t) ?? []), [mine, byTask])
  const jobs = useJobs().filter((j) => j.meta.surface === 'marketing' && j.status !== 'done')

  const seed = chosen ? fillTemplate(chosen, { product: product ?? (upload ? { name: upload.name } : null), avatar, brief }) : undefined
  const composerKey = `${chosen?.id ?? 'free'}:${product?.id ?? upload?.url ?? '-'}:${avatar?.id ?? '-'}`

  /** The pictures for the current product and person, ready for Kie; keyed so a stale set is never used. */
  const [attached, setAttached] = useState<{ key: string; refs: Ref[] } | null>(null)
  const refsKey = `${product?.id ?? upload?.url ?? '-'}:${product?.updatedAt ?? ''}:${avatar?.id ?? '-'}:${avatar?.updatedAt ?? ''}`
  const wanted = Boolean(product || upload || avatar)
  const refsReady = !wanted || attached?.key === refsKey

  // Host the product's and the person's pictures; the composer is rebuilt with them attached.
  useEffect(() => {
    if (!product && !upload && !avatar) return
    let live = true
    const run = async () => {
      setBusy('refs')
      setNote(null)
      try {
        const productRefs = product ? await elementRefs(product) : upload ? [{ url: upload.url, kind: 'image' as const }] : []
        const avatarRefs = avatar ? await elementRefs(avatar) : []
        // Product first: a model that takes one picture should get the product.
        if (live) setAttached({ key: refsKey, refs: [...productRefs.slice(0, 4), ...avatarRefs.slice(0, 3)] })
      } catch (e) {
        if (live) setNote((e as Error).message)
      } finally {
        if (live) setBusy(null)
      }
    }
    void run()
    return () => {
      live = false
    }
    // The key covers the product and the person and their pictures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refsKey])

  const uploadProduct = async (f: File | undefined) => {
    if (!f) return
    setBusy('upload')
    setNote(null)
    try {
      const { fileUrl } = await uploadMedia(f)
      setProductId(null)
      setUpload({ url: fileUrl, name: f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '), file: f })
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  /** Keep a one-off upload as a product Element, so it can be picked again next time. */
  const saveProduct = async () => {
    if (!upload) return
    setBusy('save')
    setNote(null)
    try {
      const made = await libraryApi.createElement({ name: upload.name.trim() || 'Product', kind: 'product' })
      await libraryApi.addImages(made.id, [upload.file])
      setUpload(null)
      setProductId(made.id)
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const pick = (t: MarketingTemplate) => {
    setChosen(t)
    window.requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const category: ModelCategory = chosen ? marketingKind(chosen) : 'image'
  const locks = chosen ? lockedLabels(chosen.params) : []

  return (
    <div className="st-page">
      <Hero kicker="Marketing Studio" title="Turn any product into" sub="ready-to-post content" />

      <div ref={top} className="st-section sp-narrow sp-marketing-top">
        <div className="sp-mk-pickers">
          <div className="pl-panel sp-mk-picker">
            <p className="sp-panel-title">
              <Package size={14} /> Product
            </p>
            <ElementChooser
              kind="product"
              value={productId}
              onPick={(el: Element | null) => {
                setUpload(null)
                setProductId(el?.id ?? null)
              }}
              extra={
                <>
                  {upload && (
                    <button type="button" className="sp-choice is-on" title={upload.name}>
                      <span className="sp-choice-cover">
                        <img src={upload.url} alt="" />
                      </span>
                      <span className="sp-choice-name">{upload.name}</span>
                    </button>
                  )}
                  <AddTile label={upload ? 'Replace' : 'Upload'} busy={busy === 'upload'} onClick={() => file.current?.click()} />
                </>
              }
            />
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                void uploadProduct(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {!product && !upload && <p className="sp-hint">Pick a saved product, or upload a photo for this session.</p>}
            {upload && (
              <p className="sp-hint">
                Uploaded for this session only.{' '}
                <button type="button" className="sp-link" onClick={() => void saveProduct()} disabled={busy !== null}>
                  {busy === 'save' ? 'Saving…' : 'Save it as a product'}
                </button>{' '}
                to pick it again later.
              </p>
            )}
          </div>
          <div className="pl-panel sp-mk-picker">
            <p className="sp-panel-title">
              <UserRound size={14} /> Avatar <span className="sp-hint">{chosen?.avatar === 'wanted' ? 'recommended for this template' : 'optional'}</span>
            </p>
            <ElementChooser kind="character" value={avatarId} onPick={(el) => setAvatarId(el?.id ?? null)} optional empty="No saved characters — make one in Influencer." />
          </div>
        </div>

        {chosen && (
          <div className="sp-mk-chosen">
            <span className="pl-badge pl-badge--coral">{chosen.title}</span>
            <span className="sp-hint">
              {marketingLabel(chosen.group)} · {marketingKind(chosen) === 'video' ? 'Video' : 'Image'}
              {locks.length ? ` · locked to ${locks.join(', ')}` : ''}
            </span>
            <input className="sp-input sp-grow" placeholder="Add to the brief: the offer, the angle, the season…" value={brief} onChange={(e) => setBrief(e.target.value)} />
            <QuietBtn icon={X} onClick={() => setChosen(null)} title="Close the template and write freely">
              No template
            </QuietBtn>
          </div>
        )}

        {/* Keyed on template, product, person and whether their pictures are up: the
            composer picks its model once, and takes its references as it mounts. */}
        <Composer
          key={`${composerKey}:${refsReady ? 'refs' : 'wait'}`}
          initialRefs={refsReady && wanted ? attached?.refs : undefined}
          surface="marketing"
          inline
          category={category}
          klass={chosen?.modelClass ?? 'image-edit'}
          placeholder={chosen ? 'Edit the recipe, or press Generate…' : 'Describe the product shot or pick a template below…'}
          seed={seed}
          locked={chosen?.params}
          meta={chosen ? { label: chosen.title } : undefined}
          onSubmitted={(ids) => trackJobs(ids, chosen ? [MARKETING_TAG, presetTag(chosen.id)] : MARKETING_TAG)}
        />
        {busy === 'refs' && <p className="sp-hint">Attaching pictures…</p>}
        {note && <p className="st-note">{note}</p>}
      </div>

      <div className="st-section">
        <SectionHead title="Templates" right={<Chips options={KINDS} value={kind} onPick={setKind} />} />
        <div className="sp-filter-row">
          <Chips options={MARKETING_GROUPS} value={group} onPick={setGroup} />
        </div>
        {shown.length ? (
          <PresetGrid presets={shown} onOpen={pick} active={chosen?.id} labelOf={marketingLabel} />
        ) : (
          <Empty icon={LayoutTemplate} title="No templates in that combination" sub="Widen the filter, or write freely in the box above." />
        )}
      </div>

      <div className="st-section">
        <SectionHead title="Your marketing content" right={<span className="st-pill-label">{results.length}</span>} />
        <ResultsGrid
          jobs={jobs}
          items={results}
          empty={<Empty icon={Upload} title="Nothing made here yet" sub="Pick a product and a template, then generate. Everything made on this page collects here." />}
        />
      </div>
    </div>
  )
}
