/**
 * Genjutsu's Styles: the twelve looks their Styles tab offers, each written out as the
 * prompt a video-edit model needs to redraw every frame in it — medium, materials,
 * shading, line, palette and texture — while the motion, camera and framing stay as filmed.
 *
 * There is no preview art: a card shows the name, one line and a neutral swatch until you
 * have a result in that look, which then becomes its cover (tracked by `styleTag`, the
 * way PresetCard covers a preset). `custom` is the user's own style image instead.
 */

export interface GenjutsuStyle {
  id: string
  name: string
  /** One plain line for the card. */
  line: string
  /** The look, as the edit model reads it. */
  prompt: string
}

/** Said after every look: what must not change. */
export const KEEP = 'Keep the original motion, timing, camera movement, framing and composition exactly as filmed; only the look changes.'

export const STYLES: GenjutsuStyle[] = [
  {
    id: 'cel-handpainted',
    name: 'Hand-painted cel animation',
    line: 'Classic painted backgrounds under clean inked characters.',
    prompt:
      'Redraw every frame as hand-painted cel animation: characters in clean ink outlines with flat cel colour and one hard-edged shadow tone, set over soft watercolour-and-gouache painted backgrounds with visible brush texture. Warm, slightly muted palette, gentle film grain, no 3D shading.',
  },
  {
    id: 'knitted-yarn',
    name: 'Knitted yarn world',
    line: 'Everything knitted from chunky wool, stitch by stitch.',
    prompt:
      'Redraw every frame as a knitted yarn world: people, clothes, objects and scenery all made of chunky hand-knitted wool with visible stitches, purl texture and soft fuzzy fibres. Cosy saturated yarn colours, soft studio lighting with gentle shadows between the stitches, a tactile handmade miniature feel.',
  },
  {
    id: 'expressive-2d',
    name: 'Expressive 2D animation',
    line: 'Loose, energetic hand-drawn 2D with bold shapes.',
    prompt:
      'Redraw every frame as expressive hand-drawn 2D animation: loose energetic pencil-and-ink lines of varying weight, bold simplified shapes, exaggerated poses and squash-and-stretch, flat bright fills with a few textured brush shadows, paper grain showing through. Vivid graphic palette.',
  },
  {
    id: 'rounded-toy-cgi',
    name: 'Rounded toy CGI',
    line: 'Soft, rounded vinyl-toy 3D with glossy plastic.',
    prompt:
      'Redraw every frame as rounded toy CGI: every person and object rebuilt as a soft, chubby vinyl or plastic toy with rounded edges and simplified features, glossy smooth materials with subsurface glow, bright candy colours, soft global illumination and gentle ambient occlusion, a clean miniature-playset look.',
  },
  {
    id: 'felt-stop-motion',
    name: 'Felt puppet stop motion',
    line: 'Handmade felt puppets on a miniature set.',
    prompt:
      'Redraw every frame as felt puppet stop motion: characters as handmade felt and fabric puppets with stitched seams, button or bead details and slightly fuzzy edges, on a miniature handcrafted set of felt, card and wood. Warm practical lighting, tiny imperfections and the subtle frame-to-frame jitter of stop motion.',
  },
  {
    id: 'grotesque-street-cgi',
    name: 'Grotesque street CGI',
    line: 'Gritty, exaggerated street characters in rough 3D.',
    prompt:
      'Redraw every frame as grotesque street CGI: exaggerated, slightly caricatured characters with oversized features and rough skin detail, gritty urban textures of concrete, graffiti and grime, hard sodium and neon lighting, desaturated palette with acid accents, a raw, edgy stylised 3D look.',
  },
  {
    id: 'warm-painterly-3d',
    name: 'Warm painterly 3D animation',
    line: 'Feature-film 3D with soft painted textures.',
    prompt:
      'Redraw every frame as warm painterly 3D animation: stylised feature-film characters with appealing proportions, surfaces textured with soft visible brushstrokes like a painting, warm golden-hour lighting, rich but gentle colour, soft depth of field and atmospheric haze.',
  },
  {
    id: 'graphic-cel',
    name: 'Graphic cel',
    line: 'Hard-edged flat colour, heavy blacks, poster graphics.',
    prompt:
      'Redraw every frame in a graphic cel style: bold flat colour shapes with no gradients, heavy black ink shadows, thick confident outlines, a limited palette of three or four strong colours plus black, crisp poster-like graphic design with halftone accents.',
  },
  {
    id: 'gouache-fashion',
    name: 'Expressive gouache fashion',
    line: 'Fashion illustration in loose gouache strokes.',
    prompt:
      'Redraw every frame as an expressive gouache fashion illustration: elongated elegant figures, clothing rendered in loose confident opaque gouache strokes with dry-brush edges, minimal facial detail, plenty of paper-white negative space, sophisticated palette with one or two saturated accent colours.',
  },
  {
    id: 'sculptural-3d-fashion',
    name: 'Sculptural 3D fashion',
    line: 'Couture as sculpted 3D forms in a gallery light.',
    prompt:
      'Redraw every frame as sculptural 3D fashion: figures and garments as sculpted, smooth high-end 3D forms like gallery sculpture, folds and fabric exaggerated into architectural shapes, matte ceramic and satin materials, clean monochrome or tonal palette, soft museum lighting with long gentle shadows.',
  },
  {
    id: 'chunky-low-poly',
    name: 'Chunky textured low-poly',
    line: 'Blocky low-poly 3D with hand-painted textures.',
    prompt:
      'Redraw every frame as chunky textured low-poly 3D: people and objects built from large visible faceted polygons, hand-painted textures on each facet, simple blocky shapes, bright stylised colours, flat-shaded lighting with clear facet edges, a retro handcrafted game look.',
  },
  {
    id: 'cel-shaded-anime',
    name: 'Cel-shaded CG anime',
    line: '3D anime with toon shading and crisp outlines.',
    prompt:
      'Redraw every frame as cel-shaded CG anime: anime-proportioned characters with large expressive eyes, toon shading in two or three hard-edged tones, crisp dark outlines, vivid saturated colours, glossy anime hair highlights, painted anime-style skies and backgrounds.',
  },
]

/** The user's own style image instead of a written look. */
export const CUSTOM = 'custom'

export const styleOf = (id: string | null | undefined): GenjutsuStyle | null => STYLES.find((s) => s.id === id) ?? null

export const styleName = (id: string | null | undefined): string | null => (id === CUSTOM ? 'Custom style' : styleOf(id)?.name ?? null)

export const STYLE_TAG_PREFIX = 'genjutsu-style:'

export const styleTag = (id: string) => `${STYLE_TAG_PREFIX}${id}`
