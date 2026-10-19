/**
 * Influencer — their AI Influencer Studio: build a person from traits, keep the one you
 * like as a character, then make a reference sheet of them and animate them.
 *
 *   Create          the trait wall (influencer/traits.ts) writes the prompt, which stays
 *                   visible and editable; an optional photo of your own starts the face.
 *   Characters      save results as a character Element; manage saved ones.
 *   Character sheet front / side / back and expressions from a saved character, run on
 *                   an image-edit model with the character's pictures as references.
 *   Motion          the character's cover as the first frame of an image-to-video job.
 *
 * Every tab is the engine's RailStudio (or a page of results), so jobs queue, show as
 * pending tiles and land in history like everything else. Each tab's own results are
 * told apart by the task ids it started (surfaces/track.ts).
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Clapperboard, ImagePlus, Package, UserRound, Video } from 'lucide-react'
import { RailStudio, type SlotSpec } from '../RailStudio.tsx'
import type { ModelDefinition } from '../api.ts'
import { Field, TabBar } from '../parts.tsx'
import { useElements, type Element } from '../library.ts'
import { ElementChooser } from './pageParts.tsx'
import { useHostedElement } from '../elements/useHostedElement.ts'
import { trackJobs, useTracked } from './track.ts'
import { TraitPicker } from './influencer/TraitPicker.tsx'
import { CharactersPage, SaveCharacterButton } from './influencer/CharactersPage.tsx'
import { composeCharacter, DEFAULT_SELECTION, GENJUTSU_IDEAS, genjutsuPrompt, INFLUENCER_TAGS as TAGS, randomSelection, SHEETS, sheetPrompt, type GenjutsuMode, type Selection } from './influencer/traits.ts'
import './studio-pages.css'

type Tab = 'create' | 'characters' | 'sheet' | 'motion'

const TABS: { id: Tab; label: string }[] = [
  { id: 'create', label: 'Create' },
  { id: 'characters', label: 'Characters' },
  { id: 'sheet', label: 'Sheet' },
  { id: 'motion', label: 'Motion' },
]

/** A sheet takes up to four of the character's pictures as references. */
const SHEET_SLOTS: SlotSpec[] = [
  { id: 'ref1', icon: UserRound, title: 'Character', sub: 'Main reference — the cover', wide: true },
  { id: 'ref2', icon: ImagePlus, title: 'Another angle', optional: true },
  { id: 'ref3', icon: ImagePlus, title: 'Another angle', optional: true },
  { id: 'ref4', icon: ImagePlus, title: 'Another angle', optional: true },
]


const tracker = (tag: string) => (ids: string[]) => trackJobs(ids, tag)

export function InfluencerSurface() {
  const [tab, setTab] = useState<Tab>('create')
  const [characterId, setCharacterId] = useState<string | null>(null)
  const [prePick, setPrePick] = useState<string | null>(null)
  // The builder's picks live up here, so a trip to another tab doesn't lose them.
  const [build, setBuild] = useState<Build>(START)
  const { items: elements } = useElements()
  const character = elements.find((el) => el.id === characterId && el.kind === 'character') ?? null

  const go = (next: Tab, el?: Element) => {
    if (el) setCharacterId(el.id)
    setTab(next)
  }

  const tabs = (
    <TabBar
      tabs={TABS}
      value={tab}
      onPick={(t) => {
        setPrePick(null)
        setTab(t)
      }}
    />
  )

  if (tab === 'characters') {
    return (
      <div className="sp-influencer">
        <div className="sp-tabs-row">{tabs}</div>
        <CharactersPage prePick={prePick} onSheet={(el) => go('sheet', el)} onAnimate={(el) => go('motion', el)} onCreate={() => setTab('create')} />
      </div>
    )
  }
  if (tab === 'sheet') return <SheetTab tabs={tabs} character={character} onCharacter={(el) => setCharacterId(el?.id ?? null)} />
  if (tab === 'motion') return <MotionTab tabs={tabs} character={character} onCharacter={(el) => setCharacterId(el?.id ?? null)} />
  return (
    <CreateTab
      tabs={tabs}
      build={build}
      onBuild={setBuild}
      onSaved={(taskId) => {
        setPrePick(taskId ?? null)
        setTab('characters')
      }}
    />
  )
}

/* ---------- create ---------- */

interface Build {
  tier: string
  selection: Selection
  extra: string
}

const START: Build = { tier: 'normal', selection: DEFAULT_SELECTION, extra: '' }

/** Added to the prompt while a photo sits in the slot: a reference only steers the face if the prompt says so. */
const KEEP_FACE = 'Keep the exact face, features and skin tone of the person in the reference photo'

function CreateTab({ tabs, build, onBuild, onSaved }: { tabs: ReactNode; build: Build; onBuild: (b: Build) => void; onSaved: (taskId?: string) => void }) {
  const { tier, selection, extra } = build
  const set = (patch: Partial<Build>) => onBuild({ ...build, ...patch })
  const [hasFace, setHasFace] = useState(false)
  const mine = useTracked(TAGS.create)
  const mineSet = useMemo(() => new Set(mine), [mine])

  const seed = useMemo(() => composeCharacter(tier, selection, [extra, hasFace ? KEEP_FACE : ''].filter(Boolean).join('. ')), [tier, selection, extra, hasFace])

  const header = (
    <>
      {tabs}
      <TraitPicker
        tier={tier}
        onTier={(t) => set({ tier: t })}
        selection={selection}
        onChange={(next) => set({ selection: next })}
        onRandom={() => set({ selection: randomSelection(tier) })}
        onReset={() => onBuild(START)}
      />
      <Field label="Anything else">
        <input placeholder="e.g. a small scar on the chin, always wears a red scarf" value={extra} onChange={(e) => set({ extra: e.target.value })} />
      </Field>
      <p className="sp-hint">
        The prompt below is written from your picks{hasFace ? ', and told to keep the face from your photo' : ''} — edit it freely, but a new pick rewrites it. Create makes four variations; press{' '}
        <strong>Save as character</strong> under the one you like, or tick several in{' '}
        <button type="button" className="sp-link" onClick={() => onSaved()}>
          Characters
        </button>
        .
      </p>
    </>
  )

  return (
    <RailStudio
      surface="influencer"
      category="image"
      klass="image"
      header={header}
      slots={[{ id: 'face', icon: UserRound, title: 'Upload your photo', sub: 'Optional — start from a real face', optional: true, wide: true }]}
      onSlotsChange={(slots) => setHasFace(Boolean(slots.face))}
      initialCount={4}
      promptLabel="Prompt"
      promptPlaceholder="The character to build…"
      seed={seed}
      goLabel="Create"
      historyFilter={(item) => mineSet.has(item.taskId)}
      tileActions={(item) => <SaveCharacterButton item={item} onOpen={() => onSaved(item.taskId)} />}
      onSubmitted={tracker(TAGS.create)}
      emptyTitle="No characters yet"
      emptySub="Pick the traits on the left, or write over the prompt yourself. Add a photo to build on a real face."
      explain={
        <div className="sp-explain">
          <p className="sp-panel-title">How it works</p>
          <ol>
            <li>Pick a character type and the traits you want. Each pick adds plain words to the prompt.</li>
            <li>Press Create for four variations of the same description (the stepper changes how many).</li>
            <li>Press Save as character under the one you like. It becomes an Element you can @-mention anywhere.</li>
            <li>Make a character sheet of it for more angles, then bring it to life in Motion.</li>
          </ol>
        </div>
      }
    />
  )
}

/* ---------- character sheet ---------- */

function CharacterPick({ character, onCharacter, hosting, error }: { character: Element | null; onCharacter: (el: Element | null) => void; hosting: boolean; error: string | null }) {
  return (
    <>
      <span className="st-rail-head">Character</span>
      <ElementChooser kind="character" value={character?.id ?? null} onPick={onCharacter} empty="No saved characters yet — save one in Characters first, or drop a photo in the slot below." />
      {character && hosting && <p className="sp-hint">Getting {character.name}’s pictures ready…</p>}
      {error && <p className="st-note">{error}</p>}
    </>
  )
}

function SheetTab({ tabs, character, onCharacter }: { tabs: ReactNode; character: Element | null; onCharacter: (el: Element | null) => void }) {
  const [sheet, setSheet] = useState(SHEETS[0]!.id)
  const hosted = useHostedElement(character)
  const mine = useTracked(TAGS.sheet)
  const mineSet = useMemo(() => new Set(mine), [mine])
  const initialSlots = useMemo(() => Object.fromEntries((hosted.urls ?? []).slice(0, SHEET_SLOTS.length).map((url, i) => [SHEET_SLOTS[i]!.id, url])), [hosted.urls])
  const seed = sheetPrompt(sheet, character?.description)

  const header = (
    <>
      {tabs}
      <CharacterPick character={character} onCharacter={onCharacter} hosting={hosted.busy} error={hosted.error} />
      <span className="st-rail-head">Sheet</span>
      <div className="st-chips">
        {SHEETS.map((s) => (
          <button key={s.id} type="button" className={`st-chip ${sheet === s.id ? 'is-active' : ''}`} title={s.note} onClick={() => setSheet(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="sp-hint">{SHEETS.find((s) => s.id === sheet)?.note}. Runs on an image-edit model with the character’s pictures as references.</p>
    </>
  )

  return (
    <RailStudio
      // Remounted when the character's pictures are up, so the slots start filled.
      key={`sheet:${character?.id ?? 'none'}:${hosted.urls ? hosted.urls.length : 'wait'}`}
      surface="influencer-sheet"
      category="image"
      klass="image-edit"
      header={header}
      slots={SHEET_SLOTS}
      initialSlots={initialSlots}
      promptLabel="Prompt"
      seed={seed}
      goLabel="Make sheet"
      historyFilter={(item) => mineSet.has(item.taskId)}
      onSubmitted={tracker(TAGS.sheet)}
      emptyTitle="No sheets yet"
      emptySub="Pick a saved character, choose the kind of sheet, and make it. Good sheets can be added back to the character from Characters."
    />
  )
}

/* ---------- motion: their GenShitSu ---------- */

/** Motion transfer: a reference clip to copy, and the character's pictures (@image1…). */
const TRANSFER_SLOTS: SlotSpec[] = [
  { id: 'motion', icon: Video, title: 'Motion to copy', sub: 'A reference video, 4–30 s', kind: 'video', wide: true },
  { id: 'img1', icon: UserRound, title: 'Your character', sub: '@image1 — face and body visible', kind: 'image', wide: true },
  { id: 'img2', icon: ImagePlus, title: '@image2', kind: 'image', optional: true },
  { id: 'img3', icon: ImagePlus, title: '@image3', kind: 'image', optional: true },
]

/** Objects swap: the clip to change, and what goes into it. */
const SWAP_SLOTS: SlotSpec[] = [
  { id: 'source', icon: Video, title: 'Video to change', sub: 'The clip whose motion stays', kind: 'video', wide: true },
  { id: 'img1', icon: Package, title: 'Swap in', sub: '@image1 — a character, product or clothes', kind: 'image', wide: true },
  { id: 'img2', icon: ImagePlus, title: '@image2', kind: 'image', optional: true },
  { id: 'img3', icon: ImagePlus, title: '@image3', kind: 'image', optional: true },
]

/** Kling 2.6 / 3.0 motion control copy a clip's motion onto your pictures (`input_urls` + `video_urls`). */
const isMotionControl = (m: ModelDefinition) => /motion-control/i.test(m.id)
/** Kling 3.0 Omni Transformation and Wan 2.2 Animate Replace put new things into a clip. */
const isSwap = (m: ModelDefinition) => /omni\/transformation|animate-replace/i.test(m.id)

function MotionTab({ tabs, character, onCharacter }: { tabs: ReactNode; character: Element | null; onCharacter: (el: Element | null) => void }) {
  const [mode, setMode] = useState<GenjutsuMode>('transfer')
  const [idea, setIdea] = useState<Record<GenjutsuMode, string>>({ transfer: 'copy', swap: 'person' })
  const [scene, setScene] = useState<'video' | 'image'>('video')
  const [swapWith, setSwapWith] = useState<Element | null>(null)
  const source = mode === 'transfer' ? character : (swapWith ?? character)
  const hosted = useHostedElement(source)
  const mine = useTracked(TAGS.motion)
  const mineSet = useMemo(() => new Set(mine), [mine])
  const slots = mode === 'transfer' ? TRANSFER_SLOTS : SWAP_SLOTS
  const initialSlots = useMemo(() => {
    const imageSlots = slots.filter((s) => s.kind === 'image')
    return Object.fromEntries((hosted.urls ?? []).slice(0, imageSlots.length).map((url, n) => [imageSlots[n]!.id, url]))
  }, [hosted.urls, slots])
  const seed = genjutsuPrompt(mode, idea[mode], source?.description)

  const header = (
    <>
      {tabs}
      <p className="sp-panel-title">GenShitSu</p>
      <TabBar
        tabs={[
          { id: 'transfer' as const, label: 'Motion transfer' },
          { id: 'swap' as const, label: 'Objects swap' },
        ]}
        value={mode}
        onPick={setMode}
      />
      <p className="sp-hint">
        {mode === 'transfer'
          ? 'Copies the moves from a reference video onto your character. Runs on Kling motion control.'
          : 'Keeps the video’s motion and camera, and swaps in a person, product or outfit from your pictures. Runs on Kling 3.0 Omni Transformation or Wan Animate Replace.'}
      </p>
      {mode === 'transfer' ? (
        <CharacterPick character={character} onCharacter={onCharacter} hosting={hosted.busy} error={hosted.error} />
      ) : (
        <>
          <span className="st-rail-head">Swap in a saved character or product</span>
          <ElementChooser kind="character" value={source?.kind === 'character' ? source.id : null} onPick={(el) => setSwapWith(el)} empty="No saved characters." />
          <ElementChooser kind="product" value={source?.kind === 'product' ? source.id : null} onPick={(el) => setSwapWith(el)} empty="No saved products." />
          {source && hosted.busy && <p className="sp-hint">Getting {source.name}’s pictures ready…</p>}
          {hosted.error && <p className="st-note">{hosted.error}</p>}
        </>
      )}
      <span className="st-rail-head">Idea</span>
      <div className="st-chips">
        {GENJUTSU_IDEAS[mode].map((m) => (
          <button key={m.id} type="button" className={`st-chip ${idea[mode] === m.id ? 'is-active' : ''}`} onClick={() => setIdea({ ...idea, [mode]: m.id })}>
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'transfer' && (
        <>
          <span className="st-rail-head">Scene control — background from</span>
          <div className="st-chips">
            {(['video', 'image'] as const).map((v) => (
              <button key={v} type="button" className={`st-chip ${scene === v ? 'is-active' : ''}`} onClick={() => setScene(v)}>
                {v === 'video' ? 'The motion video' : 'The character image'}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )

  return (
    <RailStudio
      // Remounted per mode and once the element's pictures are up, so the slots start filled.
      key={`genjutsu:${mode}:${source?.id ?? 'none'}:${hosted.urls ? hosted.urls.length : 'wait'}`}
      surface="influencer-motion"
      category="video"
      klass="video-ref"
      filter={mode === 'transfer' ? isMotionControl : isSwap}
      // Their GenShitSu opens on Kling 3.0 for both modes.
      preferModel={mode === 'transfer' ? /^kling-3\.0\/motion-control$/ : /^kling-3\.0-omni\/transformation$/}
      header={header}
      slots={slots}
      initialSlots={initialSlots}
      locked={mode === 'transfer' ? { character_orientation: scene } : undefined}
      promptLabel="Prompt"
      promptPlaceholder="Use @image1, @image2… for your pictures"
      seed={seed}
      goLabel={mode === 'transfer' ? 'Copy the motion' : 'Swap'}
      historyFilter={(item) => mineSet.has(item.taskId)}
      onSubmitted={tracker(TAGS.motion)}
      emptyTitle="Nothing made here yet"
      emptySub={mode === 'transfer' ? 'Add a reference video and your character, then copy the motion.' : 'Add the video to change and what to swap in, then run it.'}
      explain={
        <div className="sp-explain">
          <p className="sp-panel-title">
            <Clapperboard size={14} /> How it works
          </p>
          <p>
            Motion transfer sends your reference clip and your character’s pictures to a motion-control model, which redraws the clip with your character doing the same moves. Objects swap keeps a clip’s motion and camera and replaces a
            person, product or outfit with the one in your pictures. In the prompt, @image1 is the first picture, @image2 the second.
          </p>
        </div>
      }
    />
  )
}
