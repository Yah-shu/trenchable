import {
  SEEDANCE_GUIDE_CONTENT,
  SEEDANCE_GUIDE_FILE_NAME,
} from './guides/seedance.ts'
import {
  SEEDANCE_2_5_GUIDE_CONTENT,
  SEEDANCE_2_5_GUIDE_FILE_NAME,
} from './guides/seedance-2-5.ts'
import {
  MINIMAX_H3_GUIDE_CONTENT,
  MINIMAX_H3_GUIDE_FILE_NAME,
} from './guides/minimax-h3.ts'
import { KLING_GUIDE_CONTENT, KLING_GUIDE_FILE_NAME } from './guides/kling.ts'
import { WAN_GUIDE_CONTENT, WAN_GUIDE_FILE_NAME } from './guides/wan.ts'
import {
  WAN_IMAGE_GUIDE_CONTENT,
  WAN_IMAGE_GUIDE_FILE_NAME,
} from './guides/wan-image.ts'
import { HAILUO_GUIDE_CONTENT, HAILUO_GUIDE_FILE_NAME } from './guides/hailuo.ts'
import {
  PIXVERSE_GUIDE_CONTENT,
  PIXVERSE_GUIDE_FILE_NAME,
} from './guides/pixverse.ts'
import {
  HAPPYHORSE_GUIDE_CONTENT,
  HAPPYHORSE_GUIDE_FILE_NAME,
} from './guides/happyhorse.ts'
import {
  GROK_IMAGINE_GUIDE_CONTENT,
  GROK_IMAGINE_GUIDE_FILE_NAME,
} from './guides/grok-imagine.ts'
import {
  SEEDREAM_GUIDE_CONTENT,
  SEEDREAM_GUIDE_FILE_NAME,
} from './guides/seedream.ts'
import { FLUX_GUIDE_CONTENT, FLUX_GUIDE_FILE_NAME } from './guides/flux.ts'
import {
  IDEOGRAM_GUIDE_CONTENT,
  IDEOGRAM_GUIDE_FILE_NAME,
} from './guides/ideogram.ts'
import { IMAGEN_GUIDE_CONTENT, IMAGEN_GUIDE_FILE_NAME } from './guides/imagen.ts'
import {
  NANO_BANANA_GUIDE_CONTENT,
  NANO_BANANA_GUIDE_FILE_NAME,
} from './guides/nano-banana.ts'
import {
  GPT_IMAGE_GUIDE_CONTENT,
  GPT_IMAGE_GUIDE_FILE_NAME,
} from './guides/gpt-image.ts'
import { QWEN_GUIDE_CONTENT, QWEN_GUIDE_FILE_NAME } from './guides/qwen.ts'

export type OptimizeFamily =
  | 'seedance-2-5'
  | 'seedance'
  | 'kling'
  | 'wan'
  | 'wan-image'
  | 'minimax-h3'
  | 'hailuo'
  | 'pixverse'
  | 'happyhorse'
  | 'grok-imagine'
  | 'seedream'
  | 'flux'
  | 'ideogram'
  | 'imagen'
  | 'nano-banana'
  | 'gpt-image'
  | 'qwen'
  | 'generic-video'
  | 'generic-image'

export type MentionHint =
  | 'at-media'
  | 'at-image'
  | 'bracket-image'
  | 'element'
  | 'none'

export type OptimizeProfile = {
  family: OptimizeFamily
  label: string
  modality: 'image' | 'video'
  /** 埋め込みガイド。設定時は workdir に書き出して Grok CLI に提示する */
  guide?: { fileName: string; content: string }
  formula: string
  mention: MentionHint
  rules: string[]
  avoid: string[]
  targetLength: string
}

const SEEDANCE_GUIDE = {
  fileName: SEEDANCE_GUIDE_FILE_NAME,
  content: SEEDANCE_GUIDE_CONTENT,
}

const SEEDANCE_2_5_GUIDE = {
  fileName: SEEDANCE_2_5_GUIDE_FILE_NAME,
  content: SEEDANCE_2_5_GUIDE_CONTENT,
}

const MINIMAX_H3_GUIDE = {
  fileName: MINIMAX_H3_GUIDE_FILE_NAME,
  content: MINIMAX_H3_GUIDE_CONTENT,
}

const KLING_GUIDE = {
  fileName: KLING_GUIDE_FILE_NAME,
  content: KLING_GUIDE_CONTENT,
}

const WAN_GUIDE = {
  fileName: WAN_GUIDE_FILE_NAME,
  content: WAN_GUIDE_CONTENT,
}

const WAN_IMAGE_GUIDE = {
  fileName: WAN_IMAGE_GUIDE_FILE_NAME,
  content: WAN_IMAGE_GUIDE_CONTENT,
}

const HAILUO_GUIDE = {
  fileName: HAILUO_GUIDE_FILE_NAME,
  content: HAILUO_GUIDE_CONTENT,
}

const PIXVERSE_GUIDE = {
  fileName: PIXVERSE_GUIDE_FILE_NAME,
  content: PIXVERSE_GUIDE_CONTENT,
}

const HAPPYHORSE_GUIDE = {
  fileName: HAPPYHORSE_GUIDE_FILE_NAME,
  content: HAPPYHORSE_GUIDE_CONTENT,
}

const GROK_IMAGINE_GUIDE = {
  fileName: GROK_IMAGINE_GUIDE_FILE_NAME,
  content: GROK_IMAGINE_GUIDE_CONTENT,
}

const SEEDREAM_IMAGE_GUIDE = {
  fileName: SEEDREAM_GUIDE_FILE_NAME,
  content: SEEDREAM_GUIDE_CONTENT,
}

const FLUX_GUIDE = {
  fileName: FLUX_GUIDE_FILE_NAME,
  content: FLUX_GUIDE_CONTENT,
}

const IDEOGRAM_GUIDE = {
  fileName: IDEOGRAM_GUIDE_FILE_NAME,
  content: IDEOGRAM_GUIDE_CONTENT,
}

const IMAGEN_GUIDE = {
  fileName: IMAGEN_GUIDE_FILE_NAME,
  content: IMAGEN_GUIDE_CONTENT,
}

const NANO_BANANA_GUIDE = {
  fileName: NANO_BANANA_GUIDE_FILE_NAME,
  content: NANO_BANANA_GUIDE_CONTENT,
}

const GPT_IMAGE_GUIDE = {
  fileName: GPT_IMAGE_GUIDE_FILE_NAME,
  content: GPT_IMAGE_GUIDE_CONTENT,
}

const QWEN_GUIDE = {
  fileName: QWEN_GUIDE_FILE_NAME,
  content: QWEN_GUIDE_CONTENT,
}

const PROFILES: Record<OptimizeFamily, OptimizeProfile> = {
  'seedance-2-5': {
    family: 'seedance-2-5',
    label: 'Seedance 2.5',
    modality: 'video',
    guide: SEEDANCE_2_5_GUIDE,
    formula:
      '[Generation Goal] + [Reference Material Roles] + [Event Script / continuous timeline] + [Maintain Consistency]',
    mention: 'at-media',
    rules: [
      '公式ガイドに従い、通常生成・フレーム参照・storyboard・blockout・編集・延長の主タスクを1つに定める。',
      '参照素材ごとに、対象と参照する性質を @Image N / @Video N / @Audio N で明示する。',
      '素材本体は Grok に渡らない。入力文に明記されていない素材内容や役割を推測しない。',
      '長尺は1ステージ1状態変化で設計する。総尺だけから秒数を発明せず、既存指定がある場合だけ連続した整数秒タイムラインを使う。',
      '人物数、因果、位置関係、小道具の所有、台詞、編集範囲、結末を変えない。',
      '尺・比率・解像度などの生成パラメータは創作プロンプトへ混ぜない。',
    ],
    avoid: [
      '素材の役割や番号の推測・付け替え',
      '複数の主タスクを1プロンプトへ混在',
      '過密なタイムラインや隙間のある時間指定',
      '依頼されていない字幕禁止・品質・安定性の定型句',
      '素材の見た目から人物関係や物語上の事実を推測',
    ],
    targetLength:
      'submit-ready; event density must fit the selected duration (up to 30s)',
  },
  seedance: {
    family: 'seedance',
    label: 'Seedance',
    modality: 'video',
    guide: SEEDANCE_GUIDE,
    formula:
      '[Subject], [Action], in [Environment], camera [Camera Movement], style [Style], avoid [Constraints]',
    mention: 'at-image',
    rules: [
      '監督として書く。あいまいな形容詞より、物理・動き・カメラを具体化する。',
      'カメラ指示は原則1つ。@image1 / @Video1 などの参照タグは入力にあれば維持する。',
      'Edit（既存動画の直接変更）と Reference（性質の参照）を混同しない。',
      '目標はおおよそ60〜100語。短すぎ・長すぎを避ける。',
    ],
    avoid: [
      'cool / epic / amazing など空虚な修飾',
      '複数カメラ指示の同時指定',
      '参照タグの削除や番号の付け替え',
    ],
    targetLength: '60–100 words (or equivalent Japanese density)',
  },
  kling: {
    family: 'kling',
    label: 'Kling',
    modality: 'video',
    guide: KLING_GUIDE,
    formula:
      '2.x: Subject + Movement + Scene + (one Camera + Lighting + Atmosphere). 3.0: optional Shot 1/2 + speaker-labeled dialogue',
    mention: 'at-image',
    rules: [
      '公式構造に沿う: 被写体 → 被写体の動き → 場面 → カメラ言語 / 照明 / 雰囲気。',
      'カメラ移動は1ショットにつき1つ（slow push-in / tracking / pan など）。複合は避ける。',
      'kling-2.x / 2.6 は単ショット。Shot 2/3 を発明しない。kling-3.0 だけ、ユーザーが連続を示唆したとき Shot リストと話者付き台詞を使ってよい。',
      '単純な語彙と短い文。5〜10秒で完結する動きに絞る。',
      'I2V の場合は見た目の再記述より「何がどう動くか」を優先する。',
      '@image1 や @element_name があれば維持する。無い element を捏造しない。',
      'negative 向けの除外は本文に混ぜず、必要なら簡潔な avoid 句に留める。',
    ],
    avoid: [
      'vague "cinematic" only',
      'two camera moves in one shot',
      'Kling 2.x 本文への Shot 2/3 の発明',
      'overly complex physics in one clip',
    ],
    targetLength: '40–90 words; keep motion completable in ~5–10s',
  },
  'minimax-h3': {
    family: 'minimax-h3',
    label: 'MiniMax H3',
    modality: 'video',
    guide: MINIMAX_H3_GUIDE,
    formula:
      '[T2VA | I2VA | FL2VA | L2VA | ref] + (base 3 fields | ref 6 sections) + shots/camera/dialogue',
    mention: 'at-media',
    rules: [
      '公式タスクを1つに定める。text-to-video は T2VA。image-to-video は first のみ I2VA、first+last は FL2VA、last のみ L2VA。reference-to-video は ref の6節。',
      'Studio の @imageN / @VideoN / @AudioN は形式と番号を維持し、同じ番号の <Picture N> / <Video N> / <Audio N> を併用する。無い素材番号は捏造しない。',
      'base は integrated_multimodal_description / overall_soundscape / non_diegetic_music。I2VA・FL2VA・L2VA は先頭に公式の整列文を置く。',
      'ref は subject_definitions → summary → retention_analysis → detailed_description → 音の2節。ラベルは定義してから使う。',
      '台詞は <d>[Language] 原文</d>。話者に (S1) を付け、オフスクリーンは says in an off-screen voiceover と唇を閉じる。翻訳や言い換えをしない。',
      'BGM が不要なら non_diegetic_music: N/A。否定語で音楽や顔の固定を指示しない。',
      '服と顔は別 Subject にし、<Subject 1> is wearing <Subject 2> と結ぶ。定義にはそのショットで見える属性だけ書く。',
      '尺・比率・解像度は創作本文へ混ぜない。ユーザーが時刻を書いていないショットへ秒数を発明しない。4〜15秒に収まる密度にする。',
    ],
    avoid: [
      'Hailuo / 汎用ビデオ向けの短い自然文への潰し',
      'Studio タグの削除や番号の付け替え、公式ラベルとの番号ずれ',
      "no music / don't change などの否定制御",
      '複数アセットを1つの Subject へ雑に束ねる',
      '短い尺への台詞の詰め込み',
      '身長の small / smaller（子ども化）',
    ],
    targetLength:
      'submit-ready; fit 4–15s and ≤7000 characters; denser than generic video',
  },
  wan: {
    family: 'wan',
    label: 'Wan',
    modality: 'video',
    guide: WAN_GUIDE,
    formula:
      'T2V: Entity + Scene + Motion. I2V: Motion + Camera. Optional: No dialogue. / No background music.',
    mention: 'at-image',
    rules: [
      '公式: Entity（外見）+ Scene + Motion。I2V は画像の再描写を減らし Motion + Camera を優先する。',
      'Studio の @imageN / @VideoN は形式と番号を維持し、同じ番号の Image n / Video n を併用する。無い番号は捏造しない。',
      '台詞なしなら短い "No dialogue."、BGM なしなら "No background music."。書かなければモデルが喋ることがある。',
      'Wan 2.6 参照は character1 / character2 を維持。2.7 マルチショットはユーザーが連続を示唆したときだけ Shot N を使う。',
      'カメラ動詞は1つ（push / pull / orbit / track / tilt / crane / fixed camera）。',
      '矛盾するスタイル語を同時に入れない。目標はおおよそ80〜120語。',
    ],
    avoid: [
      'static image description with no motion (for T2V)',
      're-describing the whole uploaded image (for I2V)',
      'Studio タグの削除や Image n 番号の付け替え',
      'multiple conflicting moods',
    ],
    targetLength: '80–120 words',
  },
  'wan-image': {
    family: 'wan-image',
    label: 'Wan Image',
    modality: 'image',
    guide: WAN_IMAGE_GUIDE,
    formula: 'Subject + Setting + Style (+ Camera / Lighting / Detail). Quote in-image text',
    mention: 'at-image',
    rules: [
      '静止画 Wan。ショットリストや "No dialogue." を付けない。',
      '被写体 → 場面 → スタイル。画面内文字は引用符。',
      '編集は変更点と不変点。@imageN があれば維持する。',
      '尺・比率・解像度は創作本文へ混ぜない。',
    ],
    avoid: [
      '動画 Wan 向けの Shot タイムライン',
      'No dialogue / No background music の混入',
      '参照番号の捏造',
    ],
    targetLength: '30–80 words',
  },
  hailuo: {
    family: 'hailuo',
    label: 'Hailuo',
    modality: 'video',
    guide: HAILUO_GUIDE,
    formula:
      '[Camera command] + subject + motion + environment + lighting. Hailuo ≠ MiniMax H3',
    mention: 'at-image',
    rules: [
      'Hailuo 02 / 2.3 であり MiniMax H3 ではない。integrated_multimodal_description や <d> タグへ書き換えない。',
      '自然な物理と連続した動きを優先する（慣性・布・髪・煙など）。',
      'カメラをブラケットで書くなら公式15コマンドのみ（[Push in] / [Tracking shot] など）。dolly zoom / FPV をブラケットにしない。',
      '1つの明確なアクションと1つの主カメラ意図に絞る。',
      'I2V では見た目より動きの指示を厚くする。@image1 があれば維持する。',
    ],
    avoid: [
      'MiniMax H3 の3フィールド / ref 6節への書き換え',
      '非公式ブラケットコマンド',
      'conflicting actions',
      'extreme camera chaos',
    ],
    targetLength: '40–80 words',
  },
  pixverse: {
    family: 'pixverse',
    label: 'PixVerse',
    modality: 'video',
    guide: PIXVERSE_GUIDE,
    formula:
      'Sentence 1 subject+action+place. Sentence 2 one camera + light. Sentence 3 stability/audio. 50–80 words',
    mention: 'at-image',
    rules: [
      'V6 は字義どおりに読む。50〜80語の2〜4文。長文で主動作を埋もれさせない。',
      'カメラ動きは1つ（dolly in / pan / orbit / tracking / static）。',
      '制約は肯定（hands remain stable / held in frame）。no jitter 連打を避ける。',
      'I2V は画像を再記述せず、動き・カメラ・安定性。@imageN があれば維持する。',
      '尺・比率・解像度は創作本文へ混ぜない。',
    ],
    avoid: [
      'paragraph-length essays',
      'stacked camera moves',
      'empty cinematic / epic',
      'negative-prompt spam in the body',
    ],
    targetLength: '50–80 words in 2–4 sentences',
  },
  happyhorse: {
    family: 'happyhorse',
    label: 'HappyHorse',
    modality: 'video',
    guide: HAPPYHORSE_GUIDE,
    formula: 'Subject + Action + Scene + Camera; use [Image N] when referencing media',
    mention: 'bracket-image',
    rules: [
      '参照画像は [Image 1] / [Image 2] 形式を使い、media 配列順と一致させる。@image に変換しない。',
      '参照時は「[Image 1] の赤い旗袍の女性」のように対象を明示する。',
      'R2V では character1 … を参照順に維持する。ラベルを途中で変えない。',
      '非中文は約5000字、中文は約2500字上限を意識し、冗長な繰り返しを削る。',
      '動きとカメラを具体化し、空虚な修飾を減らす。',
    ],
    avoid: [
      'switching to @image style for this family',
      'renumbering Image references',
      'exceeding language length limits with filler',
    ],
    targetLength: 'keep concise; respect HappyHorse length limits',
  },
  'grok-imagine': {
    family: 'grok-imagine',
    label: 'Grok Imagine',
    modality: 'video',
    guide: GROK_IMAGINE_GUIDE,
    formula:
      'Subject + one action + scene + camera + lighting + one sound cue; preserve @image1',
    mention: 'at-image',
    rules: [
      '参照は @image1 形式を維持する。無い番号を捏造しない。',
      '映像なら動き1つ + カメラ1つ + 音の手がかり。I2V はソース画像を再記述しない。',
      '短く具体的に。空虚な cinematic をカメラ語に置き換える。',
      '尺・解像度は創作本文へ混ぜない。',
    ],
    avoid: ['dropping @image mentions', 'vague cinematic-only prompts'],
    targetLength: '30–80 words',
  },
  seedream: {
    family: 'seedream',
    label: 'Seedream',
    modality: 'image',
    guide: SEEDREAM_IMAGE_GUIDE,
    formula:
      'Subject first + setting + lighting + style + composition. Quote in-image text. Edit = change + preserve',
    mention: 'at-image',
    rules: [
      '被写体と定義属性を第一文に置く。スタイル前置きから始めない。',
      '画面内文字は二重引用符で原文のまま。',
      '編集系は変更点と残す要素を両方書く。',
      '参照がある場合は @imageN 記法を維持する。無い番号を捏造しない。',
    ],
    avoid: ['empty adjectives only', 'conflicting art styles', 'subject buried after style preface'],
    targetLength: '40–100 words',
  },
  flux: {
    family: 'flux',
    label: 'FLUX',
    modality: 'image',
    guide: FLUX_GUIDE,
    formula:
      'Natural language 30–80 words: subject + materials + lighting + camera + color. Hex #RRGGBB bound to an object. No negative prompts',
    mention: 'at-image',
    rules: [
      '自然な英語の描写文。キーワードサラダにしない。ネガティブプロンプトは使わない（Flux 2 は無視する）。',
      '特定色は対象に結び付けた hex（"a sofa in #8B4513"）。文末に hex を孤立させない。',
      '画面内文字は引用符。JSON 化するのはユーザーが既に JSON を使っているときだけ。',
      '@imageN があれば維持する。無い番号を捏造しない。',
    ],
    avoid: [
      'keyword salad',
      'negative prompts (no blur / no people)',
      'orphaned hex codes',
      'unprompted JSON conversion',
    ],
    targetLength: '30–80 words',
  },
  ideogram: {
    family: 'ideogram',
    label: 'Ideogram',
    modality: 'image',
    guide: IDEOGRAM_GUIDE,
    formula:
      'Natural language (~150 words). Quote lettering near the start. No negative prompts',
    mention: 'at-image',
    rules: [
      '文字が主旨なら引用符テキストを第一文に置く。',
      '否定プロンプトは使わない（no people → empty street）。',
      'スタイルは短い節で書く。--stylize や隠しパラメータを埋め込まない。',
      'おおよそ150語以内。@imageN があれば維持する。',
      'MagicPrompt 前提でも意図は本文で完結させる。',
    ],
    avoid: [
      'ambiguous text content',
      'negative prompts',
      'overloading with unrelated subjects',
    ],
    targetLength: 'up to ~150 words; lettering first when it is the point',
  },
  imagen: {
    family: 'imagen',
    label: 'Imagen',
    modality: 'image',
    guide: IMAGEN_GUIDE,
    formula: 'Photographic English: subject + setting + lighting + lens/composition. Quote text',
    mention: 'at-image',
    rules: [
      '写真的な英語の具体描写。Nano Banana の会話編集フレームへ書き換えない。',
      '肯定文。除外は短い avoid 句か negative_prompt 欄前提で本文を汚さない。',
      '画面内文字は引用符でオブジェクトに結びつける。',
      '@imageN があれば維持する。Midjourney の --ar / --v は書かない。',
    ],
    avoid: ['keyword spam', 'conflicting photographic styles', '--ar / --v tags'],
    targetLength: '30–70 words',
  },
  'nano-banana': {
    family: 'nano-banana',
    label: 'Nano Banana',
    modality: 'image',
    guide: NANO_BANANA_GUIDE,
    formula:
      'Narrative brief: subject + setting + lighting + materials + composition. Quote text. Edit = one change + preserve',
    mention: 'at-image',
    rules: [
      'キーワード列より監督ブリーフの自然文。肯定文（no cars → empty street）。',
      '生成と編集を混同しない。編集は変更点と不変点。',
      '画面内文字は引用符 + 書体。@imageN の関係（構造 / テクスチャ / 製品）を1文で結ぶ。',
      '比率はフォーム側。本文に --ar を足さない。',
    ],
    avoid: [
      'rewriting the whole scene when only a local edit is needed',
      'keyword salad',
      '--ar in the creative prompt',
    ],
    targetLength: '20–80 words',
  },
  'gpt-image': {
    family: 'gpt-image',
    label: 'GPT Image',
    modality: 'image',
    guide: GPT_IMAGE_GUIDE,
    formula:
      'Scene → subject → details → constraints. Quote or ALL CAPS for in-image text. Edit = change + preserve',
    mention: 'at-image',
    rules: [
      '背景 → 被写体 → 詳細 → 制約の順。キーワード羅列より文として通す。',
      '画面内文字は引用符または ALL CAPS。書体・配置を書く。',
      '編集は change only X + keep everything else the same。1回に1変更。',
      '@imageN があれば維持し、複数入力は役割を揃える。quality / size / background / resolution は本文へ混ぜない。',
    ],
    avoid: [
      'comma-separated tag spam',
      'quality/size/background parameters in the body',
      'naming Flare or Sunburst in the prompt',
    ],
    targetLength: '40–100 words',
  },
  qwen: {
    family: 'qwen',
    label: 'Qwen Image',
    modality: 'image',
    guide: QWEN_GUIDE,
    formula: 'Subject + Setting + Style. Quote CJK / Latin in-image text exactly',
    mention: 'at-image',
    rules: [
      '探索は Subject + Setting + Style。本番は Camera / Atmosphere / Detail を足す。',
      '画面内文字は引用符で原文（漢字・かなを含む）のまま。',
      '編集は変更点と残す要素。参照番号を捏造しない。',
      'ユーザーが日本語/中国語ならその言語で書き直す。',
    ],
    avoid: ['vague requests without visual anchors', 'CJK text rewritten into English'],
    targetLength: '30–80 words',
  },
  'generic-video': {
    family: 'generic-video',
    label: 'Video (generic)',
    modality: 'video',
    formula: 'Subject + Action + Environment + Camera + Style',
    mention: 'at-image',
    rules: [
      '動きとカメラを具体化する。1アクション + 1カメラ意図を基本とする。',
      '参照タグ（@image / [Image N] / @element）があれば形式を崩さず維持する。',
    ],
    avoid: ['empty hype words', 'too many simultaneous events'],
    targetLength: '40–90 words',
  },
  'generic-image': {
    family: 'generic-image',
    label: 'Image (generic)',
    modality: 'image',
    formula: 'Subject + details + composition + lighting + style',
    mention: 'none',
    rules: [
      '被写体・構図・光・スタイルを具体化する。',
      '参照や編集指示があれば維持・明確化する。',
    ],
    avoid: ['keyword salad', 'contradictory styles'],
    targetLength: '30–80 words',
  },
}

function isVideoModelId(modelId: string): boolean {
  return /(video|seedance|hailuo|kling|wan\/|pixverse|happyhorse|omnihuman|lip-sync|avatar)/i.test(
    modelId,
  )
}

function isWanStillImageId(id: string): boolean {
  return /wan\/[\w.-]*image(?:-pro)?$/.test(id)
}

export function resolveOptimizeFamily(modelId?: string): OptimizeFamily {
  if (!modelId) return 'generic-video'

  const id = modelId.toLowerCase()

  if (/seedance(?:[-_.]?2[-_.]?5)/.test(id)) return 'seedance-2-5'
  if (id.includes('seedance')) return 'seedance'
  if (id.includes('kling')) return 'kling'
  if (id.includes('pixverse')) return 'pixverse'
  if (id.startsWith('wan/') || id.includes('/wan')) {
    if (isWanStillImageId(id)) return 'wan-image'
    return 'wan'
  }
  if (/minimax[-_.]?h3/.test(id)) return 'minimax-h3'
  if (id.includes('hailuo')) return 'hailuo'
  if (id.includes('happyhorse')) return 'happyhorse'
  if (id.includes('grok-imagine')) return 'grok-imagine'
  if (id.includes('seedream')) return 'seedream'
  if (id.includes('flux')) return 'flux'
  if (id.includes('ideogram')) return 'ideogram'
  if (id.includes('imagen')) return 'imagen'
  if (id.includes('nano-banana')) return 'nano-banana'
  if (id.includes('gpt-image')) return 'gpt-image'
  if (id.includes('qwen')) return 'qwen'

  return isVideoModelId(id) ? 'generic-video' : 'generic-image'
}

export function getOptimizeProfile(modelId?: string): OptimizeProfile {
  return PROFILES[resolveOptimizeFamily(modelId)]
}

function formatMentionLine(profile: OptimizeProfile): string {
  switch (profile.family) {
    case 'minimax-h3':
      return '参照記法: Studio の `@imageN` / `@VideoN` / `@AudioN` を維持し、公式の `<Picture N>` / `<Video N>` / `<Audio N>` を同じ番号で併用（あれば）'
    case 'wan':
      return '参照記法: Studio の `@imageN` / `@VideoN` を維持し、公式の `Image n` / `Video n` を同じ番号で併用（あれば）'
    case 'seedance-2-5':
    case 'seedance':
    case 'kling':
    case 'wan-image':
    case 'hailuo':
    case 'pixverse':
    case 'happyhorse':
    case 'grok-imagine':
    case 'seedream':
    case 'flux':
    case 'ideogram':
    case 'imagen':
    case 'nano-banana':
    case 'gpt-image':
    case 'qwen':
    case 'generic-video':
    case 'generic-image':
      break
    default: {
      const _exhaustive: never = profile.family
      return _exhaustive
    }
  }

  switch (profile.mention) {
    case 'at-media':
      return '参照記法: `@Image N` / `@Video N` / `@Audio N` の入力形式と番号を維持（あれば）'
    case 'at-image':
      return '参照記法: `@image1` 形式を維持（あれば）'
    case 'bracket-image':
      return '参照記法: `[Image 1]` 形式を維持（あれば）'
    case 'element':
      return '参照記法: `@element_name` 形式を維持（あれば）'
    case 'none':
      return '参照記法: 特別なメンション記法なし（入力のタグは壊さない）'
    default: {
      const _exhaustive: never = profile.mention
      return _exhaustive
    }
  }
}

export function formatProfileRulesMarkdown(profile: OptimizeProfile): string {
  return [
    `## 最適化プロファイル: ${profile.label} (\`${profile.family}\`)`,
    `モダリティ: ${profile.modality}`,
    `推奨構造: ${profile.formula}`,
    `目標の長さ: ${profile.targetLength}`,
    formatMentionLine(profile),
    '',
    '### ルール',
    ...profile.rules.map((r) => `- ${r}`),
    '',
    '### 避けること',
    ...profile.avoid.map((a) => `- ${a}`),
  ].join('\n')
}
