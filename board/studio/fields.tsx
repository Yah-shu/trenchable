/**
 * Advanced settings: every field of the chosen model that the pills don't already cover.
 *
 * the reference app tucks a model's extra knobs (seed, negative prompt, audio on/off, camera
 * fixed, style…) under a disclosure next to Generate. Studio used to have nowhere for
 * them, so anything beyond prompt/aspect/size/count meant leaving for the Advanced tab.
 * This renders whatever the model declares, by field type, into the same `values` the
 * pills write to — so the job sends exactly what is on screen.
 */
import { useState, type ReactNode } from 'react'
import { ChevronDown, ImagePlus, Loader2, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { refFieldKind, type FieldSchema, type ModelDefinition } from './api.ts'
import { uploadMedia } from './library.ts'
import { RowPick, type Choice } from './parts.tsx'

/** Fields that never belong in the panel: bookkeeping, and the job-to-job links tools fill in. */
const HIDDEN = /^_|^(taskId|task_id|draft_task_id|audioId|videoId|parentTaskId|callBackUrl|callback_url)$/i

export interface FieldsProps {
  model: ModelDefinition
  values: Record<string, unknown>
  onChange: (name: string, value: unknown) => void
  /** Names already handled elsewhere (prompt, pills, slots). */
  skip?: string[]
  /** Friendly names for opaque enum values, per field — voice ids, say. */
  optionLabels?: Record<string, Record<string, string>>
}

/** The fields this panel would show for a model; empty means don't offer the disclosure. */
export function advancedFields(model: ModelDefinition, skip: string[] = []): FieldSchema[] {
  return model.fields.filter((f) => !skip.includes(f.name) && !HIDDEN.test(f.name) && f.type !== 'kling_elements')
}

const nice = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/, (c) => c.toUpperCase())

function Row({ field, children, inline }: { field: FieldSchema; children: ReactNode; inline?: boolean }) {
  return (
    <div className={`st-adv-row ${inline ? 'is-inline' : ''}`} title={field.description}>
      <span className="st-adv-label">
        {field.label || nice(field.name)}
        {field.required && <span className="st-adv-req">required</span>}
      </span>
      {children}
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`st-switch ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  )
}

function JsonBox({ value, onChange, placeholder }: { value: unknown; onChange: (v: unknown) => void; placeholder?: string }) {
  const [text, setText] = useState(() => (value === undefined || value === '' ? '' : JSON.stringify(value, null, 2)))
  const [bad, setBad] = useState(false)
  return (
    <>
      <textarea
        className="st-adv-input is-code"
        rows={4}
        value={text}
        placeholder={placeholder ?? '[ ]'}
        onChange={(e) => {
          setText(e.target.value)
          if (!e.target.value.trim()) {
            setBad(false)
            onChange(undefined)
            return
          }
          try {
            onChange(JSON.parse(e.target.value))
            setBad(false)
          } catch {
            setBad(true)
          }
        }}
      />
      {bad && <span className="st-adv-err">Not valid JSON yet — the last valid value is what will be sent.</span>}
    </>
  )
}

/** Upload slots for a reference field the composer's own slots don't cover (a mask, a last frame). */
function RefField({ field, value, onChange }: { field: FieldSchema; value: unknown; onChange: (v: unknown) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const list = (Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []) as string[]
  const kind = refFieldKind(field)
  const max = field.scalar ? 1 : (field.maxItems ?? 9)
  const accept = field.accept || (kind === 'video' ? 'video/*' : kind === 'audio' ? 'audio/*' : 'image/*')
  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setErr(null)
    try {
      const next = [...list]
      for (const f of [...files].slice(0, max - list.length)) next.push((await uploadMedia(f)).fileUrl)
      onChange(next)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="st-adv-refs">
        {list.map((url, i) => (
          <span key={`${url}-${i}`} className="st-ref">
            {kind === 'image' ? <img src={url} alt="" /> : <span className="st-ref-kind">{kind === 'video' ? 'Clip' : 'Audio'}</span>}
            <button type="button" className="st-ref-x" aria-label="Remove" onClick={() => onChange(list.filter((_, n) => n !== i))}>
              <X size={10} />
            </button>
          </span>
        ))}
        {list.length < max && (
          <label className="st-ref st-ref-drop" title={`Add ${kind}`}>
            {busy ? <Loader2 size={16} className="st-spin" /> : <ImagePlus size={16} />}
            <input type="file" accept={accept} multiple={max > 1} hidden onChange={(e) => void add(e.target.files)} />
          </label>
        )}
      </div>
      {err && <span className="st-adv-err">{err}</span>}
    </>
  )
}

function FieldInput({ field, value, onChange, labels }: { field: FieldSchema; value: unknown; onChange: (v: unknown) => void; labels?: Record<string, string> }) {
  switch (field.type) {
    case 'boolean':
      return <Toggle on={value === true} onChange={onChange} label={field.label} />
    case 'enum': {
      const choices: Choice[] = (field.enum ?? []).map((v) => ({ value: v, label: labels?.[v] ?? (v === '' ? 'Default' : v) }))
      if (!field.required && !choices.some((c) => c.value === '')) choices.unshift({ value: '', label: 'Default' })
      return <RowPick label="" value={value === undefined || value === null ? '' : String(value)} choices={choices} onPick={(v) => onChange(v === '' ? undefined : v)} />
    }
    case 'number':
      return (
        <input
          className="st-adv-input"
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 'any'}
          value={typeof value === 'number' && Number.isFinite(value) ? value : ''}
          placeholder={field.default !== undefined ? String(field.default) : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      )
    case 'textarea':
      return <textarea className="st-adv-input" rows={3} value={typeof value === 'string' ? value : ''} maxLength={field.maxLength} onChange={(e) => onChange(e.target.value)} />
    case 'json':
      return <JsonBox value={value} onChange={onChange} />
    case 'reference':
      return <RefField field={field} value={value} onChange={onChange} />
    default:
      return <input className="st-adv-input" type="text" value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''} maxLength={field.maxLength} onChange={(e) => onChange(e.target.value)} />
  }
}

/** The fields themselves, with no disclosure around them (rails show them inline). */
export function ModelFields({ model, values, onChange, skip, optionLabels }: FieldsProps) {
  const fields = advancedFields(model, skip)
  if (!fields.length) return null
  return (
    <div className="st-adv">
      {fields.map((f) => (
        <Row key={f.name} field={f} inline={f.type === 'boolean'}>
          <FieldInput field={f} value={values[f.name]} onChange={(v) => onChange(f.name, v)} labels={optionLabels?.[f.name]} />
        </Row>
      ))}
    </div>
  )
}

/** "<model> controls · Reset" over the open panel, like the reference app: Reset puts every field back to the model's default. */
function AdvancedHead({ model, skip, onChange }: Pick<FieldsProps, 'model' | 'skip' | 'onChange'>) {
  const fields = advancedFields(model, skip)
  return (
    <p className="st-adv-head">
      <span>{model.title} controls</span>
      {fields.length > 0 && (
        <button type="button" className="st-adv-reset" onClick={() => fields.forEach((f) => onChange(f.name, f.default))}>
          <RotateCcw size={11} />
          Reset
        </button>
      )}
    </p>
  )
}

/**
 * The composer's "Advanced settings" disclosure: a pill that opens the panel in a popover.
 * `extra` goes above the fields (the variant chooser).
 */
export function AdvancedPill({ extra, ...props }: FieldsProps & { extra?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const count = advancedFields(props.model, props.skip).length
  if (!count && !extra) return null
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className={`st-pill ${open ? 'is-on' : ''}`} onClick={() => setOpen((v) => !v)} title="Every other setting this model takes">
        <SlidersHorizontal size={14} />
        <span className="st-pill-label">{count}</span>
        <ChevronDown size={13} className="st-pill-chev" />
      </button>
      {open && (
        <AdvancedPop onClose={() => setOpen(false)}>
          <AdvancedHead {...props} />
          {extra}
          <ModelFields {...props} />
        </AdvancedPop>
      )}
    </div>
  )
}

/** A wider popover that stays open while you click inside it (enum menus nest inside). */
function AdvancedPop({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="st-adv-scrim" onClick={onClose} />
      <div className="st-pop is-adv" style={{ bottom: 'calc(100% + 6px)', right: 0 }} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        {children}
      </div>
    </>
  )
}

/** The rail's version: a disclosure row that expands in place. */
export function AdvancedSection({ extra, ...props }: FieldsProps & { extra?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const count = advancedFields(props.model, props.skip).length
  if (!count && !extra) return null
  return (
    <div className="st-adv-section">
      <button type="button" className="st-row" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>
          <SlidersHorizontal size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Advanced settings
        </span>
        <span className="st-row-value">
          {count}
          <ChevronDown size={13} style={{ rotate: open ? '180deg' : '0deg' }} />
        </span>
      </button>
      {open && (
        <>
          <AdvancedHead {...props} />
          {extra}
          <ModelFields {...props} />
        </>
      )}
    </div>
  )
}
