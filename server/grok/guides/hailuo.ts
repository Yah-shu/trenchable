// MiniMax Hailuo（02 / 2.3）公式の bracket カメラコマンドを、
// KIE Studio の Grok 最適化向けに要約して埋め込む。
// H3 の3フィールド構造とは別物。混同しない。
// 取得元:
// - MiniMax V1 video generation camera-command reference（15 commands）
// - https://minimax-ai.chat/models/minimax-hailuo-director-models/

export const HAILUO_GUIDE_FILE_NAME = 'Hailuo_Official_Prompt_Guide_JA.md'

export const HAILUO_GUIDE_CONTENT = `# Hailuo プロンプト最適化ガイド

Hailuo 02 / 2.3 は MiniMax H3 ではない。H3 の \`integrated_multimodal_description\` や \`<d>\` タグに書き換えない。短い物理クリップと公式の \`[command]\` カメラを使う。

## 最優先原則

1. 1アクション + 1主カメラ。6〜10秒に詰めない。
2. I2V は見た目を再記述せず、動きとカメラと連続性。
3. \`@image1\` を維持する。無い番号を捏造しない。
4. 完成プロンプト本文のみ。

## 公式カメラ（正確なブラケット）

先頭または動作の切れ目に、次の15個だけを \`[command]\` で書く。dolly zoom / orbit / crane / handheld / drone はブラケットにしない（自然文の形容に留める）。

\`[Truck left]\` \`[Truck right]\` \`[Pan left]\` \`[Pan right]\` \`[Push in]\` \`[Pull out]\` \`[Pedestal up]\` \`[Pedestal down]\` \`[Tilt up]\` \`[Tilt down]\` \`[Zoom in]\` \`[Zoom out]\` \`[Shake]\` \`[Tracking shot]\` \`[Static shot]\`

- 単一: \`[Push in] A ceramic cup on stone, steam rising, morning window light.\`
- 同時（最大3）: \`[Pan left,Pedestal up] A mountain valley at sunrise.\`
- 逐次: \`[Push in] ... then [Static shot] the camera holds as his expression changes.\`

## 本文公式

\`\`\`text
[Camera command] + subject + subject motion + environment + lighting + style
\`\`\`

物理を具体化する（慣性、布、髪、煙、液体）。空虚な cinematic だけは書かない。

first/last フレームがあるときは2枚の間の連続パスを書き、静止画の再描写をしない。
`
