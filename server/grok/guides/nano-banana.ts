// Google Cloud 公式 Nano Banana prompting guide。
// 取得元:
// - https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana
// - https://ai.google.dev/gemini-api/docs/image-generation

export const NANO_BANANA_GUIDE_FILE_NAME = 'NanoBanana_Official_Prompt_Guide_JA.md'

export const NANO_BANANA_GUIDE_CONTENT = `# Nano Banana プロンプト最適化ガイド

Gemini 画像（Nano Banana / 2 / Pro）はキーワード列より、監督ブリーフの自然文。強い動詞で操作を先に述べる。

## 最優先原則

1. 肯定文。\`no cars\` ではなく \`empty street\`。
2. 生成と編集を混同しない。編集は変更点と不変点。
3. 画面内文字は引用符 + 書体。必要なら言語指定。
4. \`@imageN\` を維持し、参照の関係（構造 / テクスチャ / 製品 / 人物）を1文で結ぶ。無い番号を捏造しない。
5. 比率はフォーム側。創作本文に \`--ar\` を足さない。
6. 完成プロンプト本文のみ。

## テキスト生成

\`\`\`text
[Subject] + [Action] + [Location/context] + [Composition] + [Style]
\`\`\`

カメラ語（low angle, aerial, medium-full）と光、材質を具体化する。

## 参照つき生成

\`\`\`text
[Reference images] + [Relationship instruction] + [New scenario]
\`\`\`

例: Using @image1 as structure and @image2 as fabric texture, render a high-fidelity armchair in a sunlit room.

## 編集

「X だけ変える。顔 / 構図 / 照明は維持」。セマンティックマスクは対象を文章で指す。

## 文字

引用符、フォント名または太さ、配置。複数行は行ごとに指定する。
`
