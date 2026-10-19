/**
 * The AI Influencer builder's traits, and the prompt they write.
 *
 * The groups, options and per-group limits make an AI influencer builder: a character type
 * (Average, Bold, Extreme, or one of six animals), then eighteen trait groups with their
 * option counts and pick limits. the reference app turns the picks into a character sheet on its own model; here
 * they become plain words for whichever Kie image model is picked, so we add the groups
 * a prompt needs that their sheet fixes for you: expression, setting and photo style.
 *
 * Human-only groups (ethnicity, age, skin, head, eyes, face features) drop out for the
 * animal types, exactly as theirs do. Only adults: their ages start at "Adult".
 */

/** Where each tab's task ids are recorded (surfaces/track.ts). */
export const INFLUENCER_TAGS = { create: 'influencer:create', sheet: 'influencer:sheet', motion: 'influencer:motion' } as const

export interface TraitOption {
  id: string
  label: string
  /** The words it adds to the prompt; defaults to the label in lower case. */
  words?: string
}

export interface TraitGroup {
  id: string
  label: string
  /** How many can be picked at once. */
  max: number
  /** Only for human types. */
  human?: boolean
  options: TraitOption[]
}

export interface Tier {
  id: string
  label: string
  human: boolean
  words: string
}

export const TIERS: Tier[] = [
  { id: 'normal', label: 'Average', human: true, words: 'a realistic, natural-looking person' },
  { id: 'freak', label: 'Bold', human: true, words: 'a striking, unconventional-looking person with slightly exaggerated features' },
  { id: 'total', label: 'Extreme', human: true, words: 'a surreal, boldly stylised human character with heavily exaggerated proportions' },
  { id: 'insects', label: 'Insect', human: false, words: 'an anthropomorphic insect character standing upright like a person' },
  { id: 'frogs', label: 'Frog', human: false, words: 'an anthropomorphic frog character standing upright like a person' },
  { id: 'cats', label: 'Cat', human: false, words: 'an anthropomorphic cat character standing upright like a person' },
  { id: 'dogs', label: 'Dog', human: false, words: 'an anthropomorphic dog character standing upright like a person' },
  { id: 'rodents', label: 'Rodent', human: false, words: 'an anthropomorphic rodent character (a capybara, mouse or hamster) standing upright like a person' },
  { id: 'birds', label: 'Bird', human: false, words: 'an anthropomorphic bird character standing upright like a person' },
]

const o = (id: string, label: string, words?: string): TraitOption => ({ id, label, words })
/** Options whose prompt words are the label plus a noun ("almond" → "almond eyes"). */
const suffixed = (prefix: string, labels: string[], noun: string) => labels.map((l) => o(`${prefix}_${l.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, l, `${l.toLowerCase()} ${noun}`))

/**
 * The groups in order, with their option counts:
 * gender 5, build 7, hairstyle 26, hair colour 13, style 8, ethnicity 6, age 3, skin 8,
 * height 3, proportions 5, head shape 10, neck 4, eye shape 11, eye colour 8, features 25,
 * facial hair 8, distinctive features 14, accessories 6. Then ours: expression, setting,
 * photo style.
 */
export const TRAIT_GROUPS: TraitGroup[] = [
  {
    id: 'gender',
    label: 'Gender',
    max: 1,
    options: [o('female', 'Female', 'woman'), o('male', 'Male', 'man'), o('trans_man', 'Trans man'), o('trans_woman', 'Trans woman'), o('non_binary', 'Non-binary', 'non-binary person')],
  },
  {
    id: 'body_type',
    label: 'Build',
    max: 1,
    options: [o('body_average', 'Average', 'average'), o('body_slim', 'Slim'), o('body_athletic', 'Athletic'), o('body_muscular', 'Muscular'), o('body_curvy', 'Curvy'), o('body_heavy', 'Heavy', 'heavy-set'), o('body_ultra', 'Ultra muscular', 'extremely muscular, bodybuilder')].map((x) => ({ ...x, words: `${x.words ?? x.label.toLowerCase()} build` })),
  },
  {
    id: 'hair',
    label: 'Hairstyle',
    max: 1,
    options: [
      o('hair_bald', 'Bald', 'bald head'),
      o('hair_buzz', 'Buzz cut'),
      o('hair_bowl', 'Bowl cut'),
      o('hair_mullet', 'Mullet'),
      o('hair_braids', 'Braids', 'braided hair'),
      o('hair_pigtails', 'Pigtails'),
      o('hair_afro', 'Afro'),
      o('hair_punk', 'Mohawk'),
      o('hair_long', 'Long hair'),
      o('hair_short', 'Short hair'),
      o('hair_bob', 'Bob', 'chin-length bob'),
      o('hair_pixie', 'Pixie cut'),
      o('hair_ponytail', 'Ponytail', 'high ponytail'),
      o('hair_bun', 'High bun', 'neat high bun'),
      o('hair_messy_bun', 'Messy bun'),
      o('hair_curly', 'Curly', 'big curly hair'),
      o('hair_wavy', 'Wavy', 'loose wavy hair'),
      o('hair_sleek', 'Sleek straight', 'sleek straight hair'),
      o('hair_locs', 'Locs', 'long locs'),
      o('hair_cornrows', 'Cornrows'),
      o('hair_undercut', 'Undercut'),
      o('hair_side_part', 'Side part', 'neat side-parted hair'),
      o('hair_slicked', 'Slicked back', 'slicked-back hair'),
      o('hair_bangs', 'Curtain bangs', 'hair with curtain bangs'),
      o('hair_shag', 'Shag', 'layered shag haircut'),
      o('hair_space_buns', 'Space buns', 'two space buns'),
    ],
  },
  {
    id: 'hair_colour',
    label: 'Hair colour',
    max: 1,
    options: suffixed('hc', ['Jet black', 'Dark brown', 'Chestnut', 'Ginger', 'Red', 'Blonde', 'Platinum', 'Grey', 'White', 'Pastel pink', 'Lilac', 'Blue', 'Green'], 'hair'),
  },
  {
    id: 'aesthetic',
    label: 'Style',
    max: 1,
    options: [o('retro', 'Retro'), o('sporty', 'Sporty'), o('y2k', 'Y2K'), o('theatrical', 'Theatre', 'theatrical'), o('goth', 'Goth'), o('suits', 'Suits', 'tailored suit'), o('streetstyle', 'Streetstyle', 'streetwear'), o('casual', 'Casual')].map((x) => ({ ...x, words: /suit/.test(x.words ?? '') ? x.words : `${x.words ?? x.label.toLowerCase()} outfit` })),
  },
  {
    id: 'ethnicity',
    label: 'Ethnicity',
    max: 1,
    human: true,
    options: [o('african', 'African', 'African'), o('east_asian', 'Asian', 'East Asian'), o('european', 'European', 'European'), o('indian', 'Indian', 'South Asian'), o('middle_eastern', 'Middle Eastern', 'Middle Eastern'), o('latin_american', 'Mixed', 'mixed-heritage')],
  },
  { id: 'age', label: 'Age', max: 1, human: true, options: [o('adult', 'Adult', 'in their late twenties'), o('mature', 'Mature', 'in their late forties'), o('senior', 'Senior', 'in their late sixties')] },
  { id: 'skin_tone', label: 'Skin colour', max: 1, human: true, options: suffixed('st', ['Porcelain', 'Fair', 'Light', 'Olive', 'Tan', 'Brown', 'Deep brown', 'Ebony'], 'skin') },
  { id: 'height', label: 'Height', max: 1, options: [o('h_average', 'Average', 'average height'), o('h_tall', 'Tall'), o('h_very_tall', 'Very tall')] },
  { id: 'proportions', label: 'Proportions', max: 2, options: [o('pr_longlimbs', 'Long limbs'), o('pr_shortlegs', 'Short legs'), o('pr_shoulders', 'Broad shoulders'), o('pr_waist', 'Tiny waist'), o('pr_petite', 'Petite frame')] },
  {
    id: 'head',
    label: 'Head shape',
    max: 1,
    human: true,
    options: [
      o('head_oval', 'Standard', 'oval face'),
      o('head_long', 'Long', 'long face'),
      o('head_round', 'Round', 'round face'),
      o('head_square', 'Square', 'square jaw'),
      o('head_heart', 'Heart', 'heart-shaped face'),
      o('head_diamond', 'Diamond', 'diamond-shaped face'),
      o('head_oblong', 'Oblong', 'oblong face'),
      o('head_triangle', 'Triangle', 'triangular face with a wide jaw'),
      o('head_pear', 'Pear', 'pear-shaped face'),
      o('head_rect', 'Rectangle', 'rectangular face'),
    ],
  },
  { id: 'neck', label: 'Neck', max: 1, human: true, options: [o('neck_normal', 'Standard', 'average neck'), o('neck_short', 'Short', 'short neck'), o('neck_long', 'Long', 'long elegant neck'), o('neck_thick', 'Thick', 'thick neck')] },
  { id: 'eye_shape', label: 'Eye shape', max: 1, human: true, options: suffixed('es', ['Almond', 'Round', 'Monolid', 'Large', 'Hooded', 'Upturned', 'Downturned', 'Deep-set', 'Close-set', 'Wide-set', 'Small'], 'eyes') },
  { id: 'eye_color', label: 'Eye colour', max: 1, human: true, options: suffixed('eye', ['Black', 'Brown', 'Hazel', 'Green', 'Blue', 'Ice blue', 'Amber', 'Grey'], 'eye colour') },
  {
    id: 'features',
    label: 'Features',
    max: 4,
    human: true,
    options: [
      o('fn_freckles', 'Freckles'),
      o('fn_dimples', 'Dimples'),
      o('fn_eyebags', 'Heavy eye bags'),
      o('fn_cheekbones', 'High cheekbones'),
      o('fn_fulllips', 'Full lips'),
      o('fn_thickbrows', 'Thick brows'),
      o('fn_mole', 'Beauty mark'),
      o('fn_tinynose', 'Tiny nose'),
      o('fn_widemouth', 'Wide mouth'),
      o('fn_pointychin', 'Pointy chin'),
      o('fn_thinlips', 'Thin lips'),
      o('fn_gap', 'Gap teeth', 'a gap between the front teeth'),
      o('fn_button', 'Button nose'),
      o('fn_roman', 'Roman nose'),
      o('fn_widenose', 'Wide nose'),
      o('fn_cleft', 'Cleft chin'),
      o('fn_strongjaw', 'Strong jaw'),
      o('fn_softjaw', 'Soft jaw'),
      o('fn_roundcheeks', 'Round cheeks'),
      o('fn_hollow', 'Hollow cheeks'),
      o('fn_arched', 'Arched brows'),
      o('fn_thinbrows', 'Thin brows'),
      o('fn_crowsfeet', 'Crow’s feet', 'crow’s feet at the eyes'),
      o('fn_laughlines', 'Laugh lines'),
      o('fn_rosy', 'Rosy cheeks'),
    ],
  },
  {
    id: 'facial_hair',
    label: 'Facial hair',
    max: 1,
    options: [o('fh_none', 'Clean', 'clean-shaven'), o('fh_stubble', 'Stubble'), o('fh_beard', 'Full beard'), o('fh_goatee', 'Goatee'), o('fh_moustache', 'Moustache'), o('fh_pencil', 'Pencil', 'pencil moustache'), o('fh_mutton', 'Mutton chops'), o('fh_handlebar', 'Handlebar', 'handlebar moustache')],
  },
  {
    id: 'distinctive',
    label: 'Distinctive features',
    max: 2,
    options: [
      o('df_hetero', 'Odd eyes', 'heterochromia, two different eye colours'),
      o('df_facetattoo', 'Face tattoo', 'a small face tattoo'),
      o('df_septum', 'Piercing', 'a septum piercing'),
      o('df_ears', 'Ear piercing', 'several ear piercings'),
      o('df_slits', 'Brow slits', 'shaved slits in one eyebrow'),
      o('df_bleached', 'Bleached', 'bleached eyebrows'),
      o('df_nobrows', 'No brows', 'no eyebrows'),
      o('df_grill', 'Gold grill', 'a gold teeth grill'),
      o('df_braces', 'Braces', 'dental braces'),
      o('df_scar', 'Brow scar', 'a small scar through one eyebrow'),
      o('df_gems', 'Face gems', 'small gems on the face'),
      o('df_elf', 'Elf ears', 'pointed elf ears'),
      o('df_lashes', 'Big lashes', 'very long eyelashes'),
      o('df_bandage', 'Nose tape', 'a strip of tape across the nose'),
    ],
  },
  {
    id: 'accessory',
    label: 'Accessories',
    max: 3,
    options: [o('acc_none', 'None', 'no accessories'), o('acc_glasses', 'Glasses'), o('acc_headphones', 'Headphones'), o('acc_jewelry', 'Jewellery', 'jewellery'), o('acc_hat', 'Hat', 'a hat'), o('acc_bag', 'Bag', 'a bag')],
  },
  {
    id: 'expression',
    label: 'Expression',
    max: 1,
    options: [o('ex_neutral', 'Neutral', 'neutral, relaxed expression'), o('ex_smile', 'Soft smile', 'a soft, warm smile'), o('ex_laugh', 'Laughing', 'laughing naturally'), o('ex_confident', 'Confident', 'confident, self-assured look'), o('ex_serious', 'Serious', 'serious, focused expression'), o('ex_playful', 'Playful', 'playful, cheeky expression'), o('ex_dreamy', 'Dreamy', 'dreamy, distant gaze')],
  },
  {
    id: 'setting',
    label: 'Setting',
    max: 1,
    options: [
      o('bg_studio', 'Plain studio', 'plain light-grey studio backdrop'),
      o('bg_home', 'At home', 'a lived-in living room'),
      o('bg_street', 'City street', 'a busy city street'),
      o('bg_cafe', 'Café', 'a cosy café'),
      o('bg_gym', 'Gym', 'a gym'),
      o('bg_nature', 'Outdoors', 'outdoors among trees'),
      o('bg_beach', 'Beach', 'a sunny beach'),
      o('bg_office', 'Office', 'a modern office'),
      o('bg_night', 'Night city', 'a neon-lit street at night'),
    ],
  },
  {
    id: 'photo',
    label: 'Photo style',
    max: 1,
    options: [
      o('ph_phone', 'Phone photo', 'candid smartphone photo, natural light, unretouched'),
      o('ph_editorial', 'Editorial', 'fashion editorial photograph, soft studio light'),
      o('ph_film', '35mm film', '35mm film photograph with natural grain'),
      o('ph_flash', 'Flash snapshot', 'direct-flash point-and-shoot snapshot'),
      o('ph_cinematic', 'Cinematic', 'cinematic still, shallow depth of field, moody grade'),
      o('ph_portrait', 'Portrait lens', '85mm portrait photograph, creamy background blur'),
    ],
  },
]

export type Selection = Record<string, string[]>

export const tierOf = (id: string) => TIERS.find((t) => t.id === id) ?? TIERS[0]!

/** The groups that apply to a character type. */
export const groupsFor = (tierId: string) => {
  const human = tierOf(tierId).human
  return TRAIT_GROUPS.filter((g) => human || !g.human)
}

/** Toggle one option, respecting the group's limit: a single-pick group swaps, a full multi-pick drops its oldest. */
export function toggleTrait(sel: Selection, group: TraitGroup, optionId: string): Selection {
  const now = sel[group.id] ?? []
  if (now.includes(optionId)) return { ...sel, [group.id]: now.filter((x) => x !== optionId) }
  const next = group.max === 1 ? [optionId] : [...now, optionId].slice(-group.max)
  return { ...sel, [group.id]: next }
}

const wordsFor = (group: TraitGroup, sel: Selection): string[] =>
  (sel[group.id] ?? []).flatMap((id) => {
    const opt = group.options.find((x) => x.id === id)
    return opt ? [opt.words ?? opt.label.toLowerCase()] : []
  })

/** 'a' or 'an' by sound, near enough for the words used here. */
const article = (next: string) => (/^(european|uni|one)/i.test(next) ? 'a' : /^[aeiou]/i.test(next) ? 'an' : 'a')

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/**
 * The description the picks add up to. Groups that don't apply to the type are ignored
 * even if something is still selected in them, so switching to "Cat" never leaves a
 * skin tone in the prompt.
 */
export function composeCharacter(tierId: string, sel: Selection, extra = ''): string {
  const tier = tierOf(tierId)
  const live = new Map(groupsFor(tierId).map((g) => [g.id, g]))
  const w = (id: string) => {
    const g = live.get(id)
    return g ? wordsFor(g, sel) : []
  }

  const gender = w('gender')[0]
  const sentences: string[] = []
  if (tier.human) {
    const who = [w('ethnicity')[0], gender ?? 'person', w('age')[0]].filter(Boolean).join(' ')
    sentences.push(`Photorealistic full-colour photo of ${article(who)} ${who}`)
    if (tierId !== 'normal') sentences.push(tier.words.replace(/^an? /, 'they are a '))
  } else {
    const sex = gender === 'woman' ? 'female' : gender === 'man' ? 'male' : gender
    sentences.push(`Photorealistic full-colour photo of ${tier.words}${sex ? `, ${sex}` : ''}`)
  }
  const body = [...w('height'), ...w('skin_tone'), ...w('body_type'), ...w('proportions'), ...w('neck')]
  if (body.length) sentences.push(list(body))
  const face = [...w('head'), ...w('eye_shape'), ...w('eye_color'), ...w('features')]
  if (face.length) sentences.push(`${list(face)}`)
  // "long hair in ginger"; a bald head has no colour to speak of.
  const style = w('hair')[0]
  const colour = (sel.hair ?? []).includes('hair_bald') ? undefined : w('hair_colour')[0]
  const hairText = style && colour ? `${style} in ${colour.replace(/ hair$/, '')}` : (style ?? colour)
  const hair = [...(hairText ? [hairText] : []), ...w('facial_hair')]
  if (hair.length) sentences.push(list(hair))
  const marks = w('distinctive')
  if (marks.length) sentences.push(`Distinctive: ${list(marks)}`)
  const outfit = w('aesthetic')[0]
  const acc = w('accessory')
  if (outfit || acc.length) sentences.push(`wearing ${outfit ? article(outfit) + ' ' + outfit : 'everyday clothes'}${acc.length ? ` with ${list(acc)}` : ''}`)
  const mood = w('expression')
  if (mood.length) sentences.push(mood[0]!)
  const where = w('setting')
  if (where.length) sentences.push(`Setting: ${where[0]}`)
  const photo = w('photo')
  sentences.push(photo.length ? photo[0]! : 'natural light, true-to-life colour')
  if (extra.trim()) sentences.push(extra.trim().replace(/[.\s]+$/, ''))
  sentences.push('One person only, face clearly visible, real skin texture, sharp focus, consistent identity')
  return sentences.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('. ') + '.'
}

/** A sensible start: a human with a few picks made, so the first prompt reads well. */
export const DEFAULT_SELECTION: Selection = {
  gender: ['female'],
  age: ['adult'],
  body_type: ['body_athletic'],
  hair: ['hair_long'],
  hair_colour: ['hc_darkbrown'],
  aesthetic: ['casual'],
  expression: ['ex_smile'],
  setting: ['bg_studio'],
  photo: ['ph_phone'],
}

/** Pick one option in every single-pick group at random (the reference app's "Randomize"). */
export function randomSelection(tierId: string, rand: () => number = Math.random): Selection {
  const out: Selection = {}
  for (const g of groupsFor(tierId)) {
    if (g.max > 1 && rand() < 0.6) continue
    const pick = g.options[Math.floor(rand() * g.options.length)]
    if (pick) out[g.id] = [pick.id]
  }
  return out
}

/* ---------- the character sheet ---------- */

export interface SheetKind {
  id: string
  label: string
  note: string
  words: string
}

export const SHEETS: SheetKind[] = [
  {
    id: 'turnaround',
    label: 'Turnaround',
    note: 'Front, side and back on one sheet',
    words: 'A character turnaround sheet of the same person from the reference images: full-body front view, left side profile, right side profile and back view, side by side on a plain light-grey background, same outfit, same lighting, neutral standing pose, evenly spaced.',
  },
  {
    id: 'expressions',
    label: 'Expressions',
    note: 'Six faces on one sheet',
    words: 'An expression sheet of the same person from the reference images: a 3-by-2 grid of head-and-shoulders close-ups showing neutral, smiling, laughing, surprised, angry and sad expressions, plain background, same lighting in every frame.',
  },
  {
    id: 'full',
    label: 'Full sheet',
    note: 'Turnaround, expressions and details',
    words: 'A complete character reference sheet of the same person from the reference images: front, side and back full-body views on the left, a row of facial expressions (neutral, smile, laugh, surprise) on the right, and close-ups of the face, hands and outfit details, plain background, consistent identity throughout.',
  },
  { id: 'front', label: 'Front', note: 'One clean front view', words: 'The same person from the reference images, full-body front view, standing straight, arms relaxed, plain light-grey background, even studio light.' },
  { id: 'three-quarter', label: 'Three-quarter', note: 'Turned 45 degrees', words: 'The same person from the reference images, three-quarter view turned 45 degrees to the left, medium shot, plain background, even studio light.' },
  { id: 'profile', label: 'Profile', note: 'Side view', words: 'The same person from the reference images, exact side profile facing left, head and shoulders, plain background, even studio light.' },
  { id: 'back', label: 'Back', note: 'From behind', words: 'The same person from the reference images seen from behind, full body, plain background, same outfit and hair.' },
  { id: 'closeup', label: 'Face close-up', note: 'Tight on the face', words: 'Tight close-up portrait of the same person from the reference images, face filling the frame, eyes to camera, soft even light, every skin detail visible.' },
]

export function sheetPrompt(sheetId: string, description = '', extra = ''): string {
  const sheet = SHEETS.find((s) => s.id === sheetId) ?? SHEETS[0]!
  const parts = [sheet.words]
  if (description.trim()) parts.push(`About them: ${description.trim().replace(/[.\s]+$/, '')}.`)
  if (extra.trim()) parts.push(extra.trim())
  parts.push('Keep the face, hair, skin tone and build identical to the references.')
  return parts.join(' ')
}

/* ---------- motion: their GenShitSu ---------- */

export type GenjutsuMode = 'transfer' | 'swap'

/**
 * Starting prompts for the two GenShitSu modes. They cite pictures as @image1, the way
 * their prompt box does; the motion and swap models read the token as the first image.
 */
export const GENJUTSU_IDEAS: Record<GenjutsuMode, { id: string; label: string; words: string }[]> = {
  transfer: [
    { id: 'copy', label: 'Copy the moves', words: 'The character from @image1 performs exactly the same moves as the person in the reference video, with the same timing.' },
    { id: 'rooftop', label: 'On a rooftop', words: 'The character from @image1 dancing on a rooftop at sunset, copying the moves from the reference video.' },
    { id: 'tokyo', label: 'New location', words: 'Same moves, new location: the character from @image1 in Tokyo at night, neon signs and wet streets.' },
    { id: 'studio', label: 'Clean studio', words: 'The character from @image1 doing the moves from the reference video in a clean white studio.' },
  ],
  swap: [
    { id: 'person', label: 'Swap the person', words: 'Replace the person in the video with the character from @image1. Keep the motion, the camera and the background exactly as they are.' },
    { id: 'outfit', label: 'Swap the outfit', words: 'Dress the person in the video in the clothes from @image1. Keep their face, the motion and the background unchanged.' },
    { id: 'product', label: 'Swap the product', words: 'Replace the product in the video with the one from @image1, matching its size, angle and lighting. Keep everything else the same.' },
    { id: 'object', label: 'Swap an object', words: 'Replace the main object in the video with the one from @image1. Keep the scene, the motion and the camera unchanged.' },
  ],
}

export function genjutsuPrompt(mode: GenjutsuMode, ideaId: string, description = ''): string {
  const list = GENJUTSU_IDEAS[mode]
  const idea = list.find((x) => x.id === ideaId) ?? list[0]!
  const about = description.trim() ? ` About @image1: ${description.trim().replace(/[.\s]+$/, '')}.` : ''
  return `${idea.words}${about}`
}
