// Wan 2.7 静止画（wan/2-7-image）。動画 Wan ガイドと分離する。
// 取得元:
// - https://docs.qwencloud.com/developer-guides/getting-started/image-models
// - https://docs.qwencloud.com/developer-guides/accuracy-tuning/image-generation

export const WAN_IMAGE_GUIDE_FILE_NAME = 'Wan_Image_Official_Prompt_Guide_JA.md'

export const WAN_IMAGE_GUIDE_CONTENT = `# Wan Image プロンプト最適化ガイド

\`wan/2-7-image\` / \`image-pro\` は動画 Wan ではない。ショットリストや \`No dialogue.\` を付けない。

## 最優先原則

1. \`Subject + Setting + Style\` を基本に、必要なら Camera / Lighting / Detail。
2. 画面内文字は引用符。CJK は原文のまま。ブランド色は対象に結び付けた hex。
3. 複数参照は役割を1つずつ。\`@imageN\` を維持する。無い番号を捏造しない。
4. 編集は変更点と不変点。
5. 完成プロンプト本文のみ。動画用の Shot タイムラインを混入しない。
6. 比率・解像度は創作本文へ混ぜない。

## 生成

\`\`\`text
[Subject and identity] in [setting], [lighting], [style / medium], [composition]
\`\`\`

被写体を第一文に置く。スタイル前置きから始めない。

## 編集

\`\`\`text
Change [X]. Keep [identity / layout / lighting] unchanged.
\`\`\`
`
