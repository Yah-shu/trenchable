/**
 * Marketing Studio's templates: product content recipes, for stills and clips.
 *
 * Like the reference app's Marketing Studio, a template is a format — product shot, UGC,
 * unboxing, before/after, testimonial, poster, marketplace listing, TV spot, social ad —
 * filled with YOUR product (and optionally a person to show it). The recipe text names
 * them as {product} and {avatar}; their pictures go in as references, product first.
 * {brief} is anything you add (the offer, the angle).
 *
 * General-purpose on purpose: nothing here assumes a brand, a niche or a claim.
 */
import type { ModelClass } from '../../presets.ts'

export type MarketingGroup = 'product' | 'lifestyle' | 'ugc' | 'unboxing' | 'before-after' | 'testimonial' | 'poster' | 'marketplace' | 'tv' | 'social'

export const MARKETING_GROUPS: { id: MarketingGroup | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'product', label: 'Product shot' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'ugc', label: 'UGC' },
  { id: 'unboxing', label: 'Unboxing' },
  { id: 'before-after', label: 'Before / after' },
  { id: 'testimonial', label: 'Testimonial' },
  { id: 'poster', label: 'Posters' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'tv', label: 'TV spot' },
  { id: 'social', label: 'Social ad' },
]

export interface MarketingTemplate {
  id: string
  title: string
  group: MarketingGroup
  modelClass: ModelClass
  note: string
  /** {product}, {avatar} and {brief} are filled in; the rest is the recipe. */
  template: string
  params?: Record<string, string | number>
  /** Whether a person appears: 'wanted' shows the avatar picker as recommended. */
  avatar?: 'wanted' | 'optional'
}

const aspect = (r: string) => ({ aspect_ratio: r, aspectRatio: r, ratio: r })
const clip = (r: string, s: number) => ({ ...aspect(r), duration: s })

export const MARKETING_TEMPLATES: MarketingTemplate[] = [
  /* ---------- stills ---------- */
  {
    id: 'mk-hero',
    title: 'Hero packshot',
    group: 'product',
    modelClass: 'image-edit',
    note: 'Clean studio shot, label sharp',
    template: 'Premium studio packshot of {product}, exactly as in the reference pictures — same shape, colours and label. Seamless soft-grey background, large soft key light, subtle reflection, crisp contact shadow, product centred with generous space. {brief}',
    params: aspect('1:1'),
  },
  {
    id: 'mk-lifestyle',
    title: 'In use at home',
    group: 'lifestyle',
    modelClass: 'image-edit',
    note: 'The product in a real, lived-in moment',
    template: 'Lifestyle photo of {product} being used naturally at home{avatar_by}, warm window light, real lived-in room, candid moment, the product clearly visible and true to the reference. {brief}',
    params: aspect('4:5'),
    avatar: 'optional',
  },
  {
    id: 'mk-outdoor',
    title: 'Out and about',
    group: 'lifestyle',
    modelClass: 'image-edit',
    note: 'On the go, natural daylight',
    template: 'Candid daylight photo of {product} on the go — on a café table, in a bag, on a walk{avatar_by}. Natural colours, shallow depth of field, the product sharp and recognisable. {brief}',
    params: aspect('4:5'),
    avatar: 'optional',
  },
  {
    id: 'mk-ugc-selfie',
    title: 'Selfie with product',
    group: 'ugc',
    modelClass: 'image-edit',
    note: 'Front-camera photo, real and unpolished',
    template: 'Front-camera phone selfie of {avatar} holding {product} up next to their face, genuine expression, ordinary indoor light, slightly imperfect framing, unretouched — looks like a real customer post. {brief}',
    params: aspect('9:16'),
    avatar: 'wanted',
  },
  {
    id: 'mk-ugc-review',
    title: 'Customer photo review',
    group: 'ugc',
    modelClass: 'image-edit',
    note: 'The kind of photo left with a review',
    template: 'Amateur phone photo of {product} on a kitchen counter or bedside table, the way a customer photographs it for a review — overhead light, a little clutter around, true colours. {brief}',
    params: aspect('1:1'),
  },
  {
    id: 'mk-unbox-flat',
    title: 'Unboxing flat lay',
    group: 'unboxing',
    modelClass: 'image-edit',
    note: 'Opened box, tissue, product on top',
    template: 'Overhead flat lay of {product} just unboxed: open shipping box, tissue paper, the product and its packaging arranged neatly on a light wooden table, soft daylight. {brief}',
    params: aspect('4:5'),
  },
  {
    id: 'mk-before-after',
    title: 'Before / after',
    group: 'before-after',
    modelClass: 'image-edit',
    note: 'Two halves, same framing',
    template: 'Split-frame before and after for {product}: left half the problem, right half the result, identical framing and light in both halves, thin divider, small "Before" and "After" labels, the product shown on the right. {brief}',
    params: aspect('1:1'),
  },
  {
    id: 'mk-testimonial',
    title: 'Testimonial card',
    group: 'testimonial',
    modelClass: 'image-edit',
    note: 'Customer portrait with a short quote',
    template: 'Social testimonial graphic: a warm natural portrait of {avatar} holding {product} on one side, a short customer quote in clean large type on the other, five stars, soft neutral background, plenty of space. {brief}',
    params: aspect('4:5'),
    avatar: 'wanted',
  },
  {
    id: 'mk-poster-launch',
    title: 'Launch poster',
    group: 'poster',
    modelClass: 'image-edit',
    note: 'Bold headline, product as the hero',
    template: 'Bold launch poster for {product}: the product large and dramatic in the centre, one short headline in heavy modern type, two brand-like colours, lots of negative space, print-quality finish. {brief}',
    params: aspect('3:4'),
  },
  {
    id: 'mk-poster-sale',
    title: 'Sale poster',
    group: 'poster',
    modelClass: 'image-edit',
    note: 'Offer-led, readable at a glance',
    template: 'Clean sale poster for {product}: product on the right, a big offer line and a short call to action on the left, high contrast, legible at a glance, no clutter. {brief}',
    params: aspect('4:5'),
  },
  {
    id: 'mk-market-main',
    title: 'Listing main image',
    group: 'marketplace',
    modelClass: 'image-edit',
    note: 'Pure white background, fills the frame',
    template: 'E-commerce main listing image of {product}: pure white background (#FFFFFF), the product filling about 85% of the frame, true colours, sharp edges, soft natural shadow, no text, no props. {brief}',
    params: aspect('1:1'),
  },
  {
    id: 'mk-market-features',
    title: 'Listing feature callouts',
    group: 'marketplace',
    modelClass: 'image-edit',
    note: 'Product with three to four callouts',
    template: 'E-commerce infographic for {product}: the product in the centre on a light background with three or four thin callout lines pointing to its key features, each with a short label in clean sans-serif type. {brief}',
    params: aspect('1:1'),
  },
  {
    id: 'mk-market-scale',
    title: 'Listing size in hand',
    group: 'marketplace',
    modelClass: 'image-edit',
    note: 'Shows how big it really is',
    template: 'E-commerce photo showing the real size of {product} held in a hand against a plain light background, natural skin, even light, the product true to the reference. {brief}',
    params: aspect('1:1'),
  },
  {
    id: 'mk-social-story',
    title: 'Story ad',
    group: 'social',
    modelClass: 'image-edit',
    note: 'Vertical, thumb-stopping, room for text',
    template: 'Vertical social story ad featuring {product}{avatar_with}: eye-catching composition, the product prominent in the middle third, clean space at the top and bottom for captions, vivid but natural colours. {brief}',
    params: aspect('9:16'),
    avatar: 'optional',
  },
  {
    id: 'mk-social-feed',
    title: 'Feed ad',
    group: 'social',
    modelClass: 'image-edit',
    note: 'Scroll-stopping square-ish feed post',
    template: 'Scroll-stopping social feed ad for {product}{avatar_with}: one clear idea, the product unmistakable, a bold contrasting background, room for one short line of text. {brief}',
    params: aspect('4:5'),
    avatar: 'optional',
  },

  /* ---------- clips ---------- */
  {
    id: 'mk-v-ugc',
    title: 'UGC talking video',
    group: 'ugc',
    modelClass: 'video-ref',
    note: 'A person talks to camera about it',
    template: 'Selfie-style vertical video: {avatar} holds {product} and talks enthusiastically straight to the phone camera about it, natural head movement and gestures, ordinary room, handheld feel, no cuts. {brief}',
    params: clip('9:16', 8),
    avatar: 'wanted',
  },
  {
    id: 'mk-v-unbox',
    title: 'Unboxing video',
    group: 'unboxing',
    modelClass: 'video-ref',
    note: 'Hands open the box and reveal it',
    template: 'Close-up video of hands opening a box and lifting out {product}, turning it towards the camera to show it off, soft daylight on a table, satisfying and smooth. {brief}',
    params: clip('9:16', 6),
  },
  {
    id: 'mk-v-orbit',
    title: 'Product turntable',
    group: 'product',
    modelClass: 'video-ref',
    note: 'Slow orbit around the product',
    template: 'Smooth slow orbit around {product} standing on a clean surface, studio light gliding across it, the label and details staying sharp, premium commercial feel. {brief}',
    params: clip('1:1', 5),
  },
  {
    id: 'mk-v-asmr',
    title: 'ASMR close-up',
    group: 'product',
    modelClass: 'video-ref',
    note: 'Macro textures and gentle handling',
    template: 'ASMR-style macro video of {product}: slow, gentle handling, close-up textures, soft light, calm and tactile. {brief}',
    params: clip('9:16', 5),
  },
  {
    id: 'mk-v-tv',
    title: 'TV spot',
    group: 'tv',
    modelClass: 'video-ref',
    note: 'Cinematic, widescreen, big-budget feel',
    template: 'Cinematic widescreen TV commercial shot: {product} revealed in a dramatic, beautifully lit setting{avatar_with}, slow camera move, shallow depth of field, rich colour grade, big-budget feel. {brief}',
    params: clip('16:9', 8),
    avatar: 'optional',
  },
  {
    id: 'mk-v-before-after',
    title: 'Before / after video',
    group: 'before-after',
    modelClass: 'video-ref',
    note: 'The change, then the product',
    template: 'Short vertical video showing a transformation: it starts on the problem, a quick wipe transition, then the improved result with {product} in frame, same framing throughout. {brief}',
    params: clip('9:16', 6),
  },
  {
    id: 'mk-v-testimonial',
    title: 'Video testimonial',
    group: 'testimonial',
    modelClass: 'video-ref',
    note: 'A calm, sincere customer story',
    template: '{avatar} sits at home and talks sincerely to camera about using {product}, holding it in one hand, soft natural light, medium close-up, no cuts. {brief}',
    params: clip('9:16', 8),
    avatar: 'wanted',
  },
  {
    id: 'mk-v-hook',
    title: 'Social hook',
    group: 'social',
    modelClass: 'video-ref',
    note: 'A fast, attention-grabbing opener',
    template: 'Fast, attention-grabbing vertical opener: a quick push-in onto {product} with a satisfying motion, punchy and bright, made to stop the scroll in the first second. {brief}',
    params: clip('9:16', 5),
  },
  {
    id: 'mk-v-howto',
    title: 'How to use it',
    group: 'ugc',
    modelClass: 'video-ref',
    note: 'Step-by-step demonstration',
    template: 'Vertical how-to video: {avatar_or_hands} demonstrate how to use {product} step by step on a clean table, clear simple movements, close framing, bright even light. {brief}',
    params: clip('9:16', 8),
    avatar: 'optional',
  },
]

export interface Subject {
  name: string
  description?: string
}

/** How a subject reads in a recipe: its name, with its notes in brackets if it has any. */
const describe = (s: Subject, fallback: string) => {
  const name = s.name.trim() || fallback
  const notes = s.description?.trim().replace(/[.\s]+$/, '')
  return notes ? `${name} (${notes.slice(0, 220)})` : name
}

/**
 * The recipe with your product, person and brief written in. Without a product it says
 * "the product in the reference pictures"; without a person, an everyday customer.
 */
export function fillTemplate(t: Pick<MarketingTemplate, 'template'>, opts: { product?: Subject | null; avatar?: Subject | null; brief?: string }): string {
  const product = opts.product ? `the product "${describe(opts.product, 'the product')}"` : 'the product in the reference pictures'
  const person = opts.avatar ? `the person from the reference pictures, ${describe(opts.avatar, 'the presenter')}` : 'a relatable everyday customer'
  return t.template
    .replaceAll('{product}', product)
    .replaceAll('{avatar}', person)
    .replaceAll('{avatar_by}', opts.avatar ? ` by ${person}` : '')
    .replaceAll('{avatar_with}', opts.avatar ? `, with ${person}` : '')
    .replaceAll('{avatar_or_hands}', opts.avatar ? person : 'a pair of hands')
    .replaceAll('{brief}', opts.brief?.trim() ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const marketingKind = (t: Pick<MarketingTemplate, 'modelClass'>): 'image' | 'video' => (t.modelClass === 'video' || t.modelClass === 'video-ref' ? 'video' : 'image')

export function filterTemplates(list: MarketingTemplate[], group: MarketingGroup | 'all', type: 'all' | 'image' | 'video'): MarketingTemplate[] {
  return list.filter((t) => (group === 'all' || t.group === group) && (type === 'all' || marketingKind(t) === type))
}

export const marketingLabel = (g: string) => MARKETING_GROUPS.find((x) => x.id === g)?.label ?? g

export const MARKETING_TAG = 'marketing'
