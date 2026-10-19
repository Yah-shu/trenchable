/**
 * Names for the voices Kie's speech models only know by id.
 *
 * ElevenLabs' `voice` field is an enum of 67 opaque ids (`EkK5I93UQWFDigLMpZcX`), which is
 * unusable as a picker. The names and one-line notes come from Kie's own model docs
 * (docs.kie.ai/market/elevenlabs/text-to-speech-multilingual-v2) — one list shared by
 * Narration, Turbo 2.5 and Dialogue v3. Every id has a preview clip on Kie's CDN, which is
 * what the picker's play button streams.
 *
 * Gemini's speech models take a voice by name instead, but 2.5 Pro / 3.1 Flash and 3.8 offer
 * different sets, and 2.5 / 3.1 also ask for an accent; both lists are kept here.
 */

export interface Voice {
  id: string
  name: string
  /** What it sounds like, in ElevenLabs' words. */
  note: string
}

export const ELEVEN_VOICES: Voice[] = [
  { id: 'EkK5I93UQWFDigLMpZcX', name: 'James', note: 'Husky, Engaging and Bold' },
  { id: 'Z3R5wn05IrDiVCyEkUrK', name: 'Arabella', note: 'Mysterious and Emotive' },
  { id: 'NNl6r8mD7vthiJatiJt1', name: 'Bradford', note: 'Expressive and Articulate' },
  { id: 'YOq2y2Up4RgXP2HyXjE5', name: 'Xavier', note: 'Dominating, Metallic Announcer' },
  { id: 'B8gJV1IhpuegLxdpXFOE', name: 'Kuon', note: 'Cheerful, Clear and Steady' },
  { id: '2zRM7PkgwBPiau2jvVXc', name: 'Monika Sogam', note: 'Deep and Natural' },
  { id: '1SM7GgM6IMuvQlz2BwM3', name: 'Mark', note: 'Casual, Relaxed and Light' },
  { id: '5l5f8iK3YPeGga21rQIX', name: 'Adeline', note: 'Feminine and Conversational' },
  { id: 'scOwDtmlUjD3prqpp97I', name: 'Sam', note: 'Support Agent' },
  { id: 'NOpBlnGInO9m6vDvFkFC', name: 'Spuds Oxley', note: 'Wise and Approachable' },
  { id: 'BZgkqPqms7Kj9ulSkVzn', name: 'Eve', note: 'Authentic, Energetic and Happy' },
  { id: 'wo6udizrrtpIxWGp2qJk', name: 'Northern Terry', note: '' },
  { id: 'gU0LNdkMOQCOrPrwtbee', name: 'British Football Announcer', note: '' },
  { id: 'DGzg6RaUqxGRTHSBjfgF', name: 'Brock', note: 'Commanding and Loud Sergeant' },
  { id: 'x70vRnQBMBu4FAYhjJbO', name: 'Nathan', note: 'Virtual Radio Host' },
  { id: 'Sm1seazb4gs7RSlUVw7c', name: 'Anika', note: 'Animated, Friendly and Engaging' },
  { id: 'P1bg08DkjqiVEzOn76yG', name: 'Viraj', note: 'Rich and Soft' },
  { id: 'qDuRKMlYmrm8trt5QyBn', name: 'Taksh', note: 'Calm, Serious and Smooth' },
  { id: 'qXpMhyvQqiRxWQs4qSSB', name: 'Horatius', note: 'Energetic Character Voice' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', note: 'Energetic, Social Media Creator' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', note: 'Husky Trickster' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', note: 'Enthusiast, Quirky Attitude' },
  { id: 'kPzsL2i3teMYv0FxEYQ6', name: 'Brittney', note: 'Social Media Voice - Fun, Youthful & Informative' },
  { id: 'UgBBYS2sOqTuMpoF3BR0', name: 'Mark', note: 'Natural Conversations' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella', note: 'Professional, Bright, Warm' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', note: 'Deep, Resonant and Comforting' },
  { id: 'uYXf8XasLslADfZ2MB4u', name: 'Hope', note: 'Bubbly, Gossipy and Girly' },
  { id: 'gs0tAILXbY5DNrJrsM6F', name: 'Jeff', note: 'Classy, Resonating and Strong' },
  { id: 'DTKMou8ccj1ZaWGBiotd', name: 'Jamahal', note: 'Young, Vibrant, and Natural' },
  { id: 'vBKc2FfBKJfcZNyEt1n6', name: 'Finn', note: 'Youthful, Eager and Energetic' },
  { id: 'DYkrAHD8iwork3YSUBbs', name: 'Tom', note: 'Conversations & Books' },
  { id: '56AoDkrOh6qfVPDXZ7Pt', name: 'Cassidy', note: 'Crisp, Direct and Clear' },
  { id: 'eR40ATw9ArzDf9h3v7t7', name: 'Addison 2.0', note: 'Australian Audiobook & Podcast' },
  { id: 'g6xIsTj2HwM6VR4iXFCw', name: 'Jessica Anne Bogart', note: 'Chatty and Friendly' },
  { id: 'lcMyyd2HUfFzxdCaC4Ta', name: 'Lucy', note: 'Fresh & Casual' },
  { id: '6aDn1KB0hjpdcocrUkmq', name: 'Tiffany', note: 'Natural and Welcoming' },
  { id: 'Sq93GQT4X1lKDXsQcixO', name: 'Felix', note: 'Warm, Positive & Contemporary RP' },
  { id: 'flHkNRp1BlvT73UL6gyz', name: 'Jessica Anne Bogart', note: 'Eloquent Villain' },
  { id: '9yzdeviXkFddZ4Oz8Mok', name: 'Lutz', note: 'Chuckling, Giggly and Cheerful' },
  { id: 'pPdl9cQBQq4p6mRkZy2Z', name: 'Emma', note: 'Adorable and Upbeat' },
  { id: 'zYcjlYFOd3taleS0gkk3', name: 'Edward', note: 'Loud, Confident and Cocky' },
  { id: 'nzeAacJi50IvxcyDnMXa', name: 'Marshal', note: 'Friendly, Funny Professor' },
  { id: 'ruirxsoakN0GWmGNIo04', name: 'John Morgan', note: 'Gritty, Rugged Cowboy' },
  { id: 'TC0Zp7WVFzhA8zpTlRqV', name: 'Aria', note: 'Sultry Villain' },
  { id: 'ljo9gAlSqKOvF6D8sOsX', name: 'Viking Bjorn', note: 'Epic Medieval Raider' },
  { id: 'PPzYpIqttlTYA83688JI', name: 'Pirate Marshal', note: '' },
  { id: '8JVbfL6oEdmuxKn5DK2C', name: 'Johnny Kid', note: 'Serious and Calm Narrator' },
  { id: 'iCrDUkL56s3C8sCRl7wb', name: 'Hope', note: 'Poetic, Romantic and Captivating' },
  { id: 'wJqPPQ618aTW29mptyoc', name: 'Ana Rita', note: 'Smooth, Expressive and Bright' },
  { id: 'EiNlNiXeDU1pqqOPrYMO', name: 'John Doe', note: 'Deep' },
  { id: '4YYIPFl9wE5c4L2eu2Gb', name: 'Burt Reynolds™', note: 'Deep, Smooth and Clear' },
  { id: '6F5Zhi321D3Oq7v1oNT4', name: 'Hank', note: 'Deep and Engaging Narrator' },
  { id: 'YXpFCvM1S3JbWEJhoskW', name: 'Wyatt', note: 'Wise Rustic Cowboy' },
  { id: 'LG95yZDEHg6fCZdQjLqj', name: 'Phil', note: 'Explosive, Passionate Announcer' },
  { id: 'CeNX9CMwmxDxUF5Q2Inm', name: 'Johnny Dynamite', note: 'Vintage Radio DJ' },
  { id: 'aD6riP1btT197c6dACmy', name: 'Rachel M', note: 'Pro British Radio Presenter' },
  { id: 'mtrellq69YZsNwzUSyXh', name: 'Rex Thunder', note: 'Deep N Tough' },
  { id: 'dHd5gvgSOzSfduK4CvEg', name: 'Ed', note: 'Late Night Announcer' },
  { id: 'eVItLK1UvXctxuaRV2Oq', name: 'Jean', note: 'Alluring and Playful Femme Fatale' },
  { id: 'esy0r39YPLQjOczyOib8', name: 'Britney', note: 'Calm and Calculative Villain' },
  { id: 'Tsns2HvNFKfGiNjllgqo', name: 'Sven', note: 'Emotional and Nice' },
  { id: '1U02n4nD6AdIZ9CjF053', name: 'Viraj', note: 'Smooth and Gentle' },
  { id: 'AeRdCCKzvd23BpJoofzx', name: 'Nathaniel', note: 'Engaging, British and Calm' },
  { id: 'LruHrtVF6PSyGItzMNHS', name: 'Benjamin', note: 'Deep, Warm, Calming' },
  { id: '1wGbFxmAM3Fgw63G1zZJ', name: 'Allison', note: 'Calm, Soothing and Meditative' },
  { id: 'hqfrgApggtO1785R4Fsn', name: 'Theodore HQ', note: 'Serene and Grounded' },
  { id: 'MJ0RnG71ty4LH3dvNfSd', name: 'Leon', note: 'Soothing and Grounded' },
]

const byId = new Map(ELEVEN_VOICES.map((v) => [v.id, v]))

/** The clip Kie hosts for every ElevenLabs voice. */
export const voicePreviewUrl = (id: string) => `https://static.aiquickdraw.com/elevenlabs/voice/${id}.mp3`

/** A voice's name for a picker; an id nobody has named yet reads "Voice 3" by its place in the list. */
export function voiceName(id: string, ids: string[] = []): string {
  const v = byId.get(id)
  if (v) return v.name
  const at = ids.indexOf(id)
  return at >= 0 ? `Voice ${at + 1}` : id
}

/** Name plus note, for a list where several voices share a first name (two Marks, two Hopes). */
export function voiceLabel(id: string, ids: string[] = []): string {
  const v = byId.get(id)
  if (!v) return voiceName(id, ids)
  return v.note ? `${v.name} · ${v.note}` : v.name
}

/** `optionLabels` for a voice enum field, so Advanced settings shows names too. */
export const voiceLabels = (ids: string[]): Record<string, string> => Object.fromEntries(ids.map((id) => [id, voiceLabel(id, ids)]))

/* ---------- the voice picker's cards and chips ---------- */

/**
 * What a voice is for, read off its name and note. Kie's list carries nothing else — no
 * gender, age or accent field — so the picker's filter chips are these words rather than
 * guesses about who is speaking.
 */
const USES: [string, RegExp][] = [
  ['Narration', /narrat|audiobook|books|storytell|podcast|poetic/i],
  ['Conversational', /conversation|casual|natural|chatty|friendly|welcoming|relaxed|approachable/i],
  ['Calm', /calm|sooth|meditat|gentle|serene|grounded|soft|smooth/i],
  ['Deep', /deep|resonant|husky|rich|gritty|tough/i],
  ['Energetic', /energetic|cheerful|bubbly|upbeat|happy|vibrant|eager|\bfun\b|animated|enthusias|explosive|passionate/i],
  ['Announcer', /announcer|radio|host|\bdj\b|presenter|sergeant|commanding/i],
  ['Character', /villain|pirate|viking|cowboy|trickster|character|raider|femme|professor|mysterious|metallic/i],
  ['Social media', /social media|creator/i],
  ['British', /british|\brp\b/i],
]
export const VOICE_USES = USES.map(([u]) => u)

export const voiceUses = (text: string): string[] => USES.filter(([, re]) => re.test(text)).map(([u]) => u)

/** One card in the picker: whatever the speech model calls it, a name, a line, chips, a clip. */
export interface VoiceOption {
  /** The value the model's field takes: an ElevenLabs id, a Gemini voice name. */
  id: string
  name: string
  note: string
  tags: string[]
  preview?: string
}

/** ElevenLabs voices as cards, in the catalogue's order, each with Kie's preview clip. */
export const elevenOptions = (ids: string[]): VoiceOption[] =>
  ids.map((id) => {
    const name = voiceName(id, ids)
    const note = byId.get(id)?.note ?? ''
    return { id, name, note, tags: voiceUses(`${name} ${note}`), preview: voicePreviewUrl(id) }
  })

/** Gemini voices as cards; 3.8 files each under a use case, which becomes its chip. Google hosts no clips. */
export const geminiOptions = (list: GeminiVoice[]): VoiceOption[] => list.map((v) => ({ id: v.name, name: v.name, note: v.note || GEMINI_TRAITS[v.name] || '', tags: v.note ? [v.note] : [] }))

/** The picker's search and chip together: every word of the query in the name, note or chips. */
export function findVoices(list: VoiceOption[], query: string, tag: string | null): VoiceOption[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return list.filter((v) => {
    if (tag && !v.tags.includes(tag)) return false
    const hay = `${v.name} ${v.note} ${v.tags.join(' ')}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

/** The chips worth showing for a list, with how many voices each holds, in a fixed order. */
export function voiceChips(list: VoiceOption[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const v of list) for (const t of v.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  const order = (t: string) => (VOICE_USES.includes(t) ? VOICE_USES.indexOf(t) : VOICE_USES.length)
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => order(a.tag) - order(b.tag))
}

/** A deterministic swatch colour for a voice name (content colour, like an avatar's — not chrome). */
export function swatchOf(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `hsl(${h % 360} 70% 84%)`
}

export interface GeminiVoice {
  name: string
  /** The use case Google files it under (3.8 only). */
  note: string
}

/** Gemini 2.5 Pro and 3.1 Flash TTS: 30 preset voices. */
export const GEMINI_VOICES: GeminiVoice[] = [
  { name: 'Achernar', note: '' },
  { name: 'Achird', note: '' },
  { name: 'Algenib', note: '' },
  { name: 'Algieba', note: '' },
  { name: 'Alnilam', note: '' },
  { name: 'Aoede', note: '' },
  { name: 'Autonoe', note: '' },
  { name: 'Callirrhoe', note: '' },
  { name: 'Charon', note: '' },
  { name: 'Despina', note: '' },
  { name: 'Enceladus', note: '' },
  { name: 'Erinome', note: '' },
  { name: 'Fenrir', note: '' },
  { name: 'Gacrux', note: '' },
  { name: 'Iapetus', note: '' },
  { name: 'Kore', note: '' },
  { name: 'Laomedeia', note: '' },
  { name: 'Leda', note: '' },
  { name: 'Orus', note: '' },
  { name: 'Puck', note: '' },
  { name: 'Pulcherrima', note: '' },
  { name: 'Rasalgethi', note: '' },
  { name: 'Sadachbia', note: '' },
  { name: 'Sadaltager', note: '' },
  { name: 'Schedar', note: '' },
  { name: 'Sulafat', note: '' },
  { name: 'Umbriel', note: '' },
  { name: 'Vindemiatrix', note: '' },
  { name: 'Zephyr', note: '' },
  { name: 'Zubenelgenubi', note: '' },
]

/** Gemini 3.8 Flash and Flash Lite TTS: 70 voices, grouped by use case. Kie's default is Fola. */
export const GEMINI_38_VOICES: GeminiVoice[] = [
  { name: 'Bodi', note: 'Tutor' },
  { name: 'Lumi', note: 'Tutor' },
  { name: 'Sadaltager', note: 'Tutor' },
  { name: 'Sola', note: 'Tutor' },
  { name: 'Sulafat', note: 'Tutor' },
  { name: 'Varo', note: 'Tutor' },
  { name: 'Zephyr', note: 'Tutor' },
  { name: 'Koda', note: 'Commercial voiceover' },
  { name: 'Kore', note: 'Commercial voiceover' },
  { name: 'Nika', note: 'Commercial voiceover' },
  { name: 'Tavi', note: 'Commercial voiceover' },
  { name: 'Zeno', note: 'Commercial voiceover' },
  { name: 'Algenib', note: 'Instructional' },
  { name: 'Despina', note: 'Instructional' },
  { name: 'Erinome', note: 'Instructional' },
  { name: 'Kira', note: 'Instructional' },
  { name: 'Ludo', note: 'Instructional' },
  { name: 'Mako', note: 'Instructional' },
  { name: 'Rasalgethi', note: 'Instructional' },
  { name: 'Rina', note: 'Instructional' },
  { name: 'Alnilam', note: 'Podcast' },
  { name: 'Brio', note: 'Podcast' },
  { name: 'Jori', note: 'Podcast' },
  { name: 'Laomedeia', note: 'Podcast' },
  { name: 'Rami', note: 'Podcast' },
  { name: 'Veda', note: 'Podcast' },
  { name: 'Achird', note: 'Storyteller' },
  { name: 'Enzo', note: 'Storyteller' },
  { name: 'Riko', note: 'Storyteller' },
  { name: 'Sami', note: 'Storyteller' },
  { name: 'Zali', note: 'Storyteller' },
  { name: 'Zubenelgenubi', note: 'Storyteller' },
  { name: 'Algieba', note: 'Digital assistant' },
  { name: 'Aoede', note: 'Digital assistant' },
  { name: 'Autonoe', note: 'Digital assistant' },
  { name: 'Callirrhoe', note: 'Digital assistant' },
  { name: 'Enceladus', note: 'Digital assistant' },
  { name: 'Gero', note: 'Digital assistant' },
  { name: 'Iapetus', note: 'Digital assistant' },
  { name: 'Neno', note: 'Digital assistant' },
  { name: 'Olin', note: 'Digital assistant' },
  { name: 'Tari', note: 'Digital assistant' },
  { name: 'Umbriel', note: 'Digital assistant' },
  { name: 'Achernar', note: 'Call center' },
  { name: 'Charon', note: 'Call center' },
  { name: 'Daro', note: 'Call center' },
  { name: 'Fola', note: 'Call center' },
  { name: 'Hali', note: 'Call center' },
  { name: 'Milo', note: 'Call center' },
  { name: 'Puck', note: 'Call center' },
  { name: 'Arlo', note: 'Concierge' },
  { name: 'Cleo', note: 'Concierge' },
  { name: 'Fenrir', note: 'Concierge' },
  { name: 'Finn', note: 'Concierge' },
  { name: 'Leda', note: 'Concierge' },
  { name: 'Lora', note: 'Concierge' },
  { name: 'Orus', note: 'Concierge' },
  { name: 'Enya', note: 'Tech support' },
  { name: 'Jett', note: 'Tech support' },
  { name: 'Knox', note: 'Tech support' },
  { name: 'Nyla', note: 'Tech support' },
  { name: 'Sadachbia', note: 'Tech support' },
  { name: 'Vindemiatrix', note: 'Tech support' },
  { name: 'Cruz', note: 'Professional' },
  { name: 'Elio', note: 'Professional' },
  { name: 'Gacrux', note: 'Professional' },
  { name: 'Pulcherrima', note: 'Professional' },
  { name: 'Schedar', note: 'Professional' },
  { name: 'Tova', note: 'Professional' },
  { name: 'Zuri', note: 'Professional' },
]

/** Google's one-word character for each 2.5 Pro / 3.1 Flash voice (ai.google.dev speech-generation docs), for picker cards. */
export const GEMINI_TRAITS: Record<string, string> = {
  Zephyr: 'Bright', Puck: 'Upbeat', Charon: 'Informative', Kore: 'Firm', Fenrir: 'Excitable', Leda: 'Youthful',
  Orus: 'Firm', Aoede: 'Breezy', Callirrhoe: 'Easy-going', Autonoe: 'Bright', Enceladus: 'Breathy', Iapetus: 'Clear',
  Umbriel: 'Easy-going', Algieba: 'Smooth', Despina: 'Smooth', Erinome: 'Clear', Algenib: 'Gravelly', Rasalgethi: 'Informative',
  Laomedeia: 'Upbeat', Achernar: 'Soft', Alnilam: 'Firm', Schedar: 'Even', Gacrux: 'Mature', Pulcherrima: 'Forward',
  Achird: 'Friendly', Zubenelgenubi: 'Casual', Vindemiatrix: 'Gentle', Sadachbia: 'Lively', Sadaltager: 'Knowledgeable', Sulafat: 'Warm',
}

/**
 * The ElevenLabs voices whose names (in Kie's list) are women's — only for picking a sensible Gemini
 * stand-in when a dub has to fall back (audio/DubTab.tsx shows it, and it can be changed there).
 */
const ELEVEN_WOMEN = new Set(['Arabella', 'Monika Sogam', 'Adeline', 'Eve', 'Anika', 'Laura', 'Brittney', 'Bella', 'Hope', 'Cassidy', 'Addison 2.0', 'Jessica Anne Bogart', 'Lucy', 'Tiffany', 'Emma', 'Aria', 'Ana Rita', 'Rachel M', 'Jean', 'Britney', 'Allison'])

/** The Gemini voice that stands in for an ElevenLabs one: Kore for a woman's name, Charon otherwise. */
export const geminiStandIn = (elevenId: string): string => (ELEVEN_WOMEN.has(byId.get(elevenId)?.name ?? '') ? 'Kore' : 'Charon')

/** Accent, style and pace — 2.5 Pro and 3.1 Flash only; accent is required there. */
export const GEMINI_ACCENTS = ['Neutral', 'American (Gen)', 'American (Valley)', 'American (South)', 'British (RP)', 'British (Brixton)', 'Transatlantic', 'Australian']
export const GEMINI_STYLES = ['Vocal Smile', 'Newscaster', 'Whisper', 'Empathetic', 'Promo/Hype', 'Deadpan']
export const GEMINI_PACES = ['Natural', 'Rapid Fire', 'The Drift', 'Staccato']
