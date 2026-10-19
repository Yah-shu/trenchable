// Google Imagen 4 系。Nano Banana（Gemini 画像）とは別プロファイル。
// 写真寄りの具体英語。取得元は Vertex / Gemini 画像の一般的公式プラクティスに合わせる。
// https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana
// （肯定文・カメラ語・引用テキストは Imagen 4 でも有効）

export const IMAGEN_GUIDE_FILE_NAME = 'Imagen_Official_Prompt_Guide_JA.md'

export const IMAGEN_GUIDE_CONTENT = `# Imagen プロンプト最適化ガイド

Imagen 4 は写真的な英語の具体描写。キーワードサラダより文。Nano Banana の会話編集フレームには書き換えない。

## 最優先原則

1. 被写体 + 場所 + 構図 + 光 + スタイル。
2. 肯定文。除外は短い avoid 句か negative_prompt 欄前提で本文を汚さない。
3. 画面内文字は引用符でオブジェクトに結びつける（看板の "OPEN"）。
4. スタイル語は1系統。
5. 完成プロンプト本文のみ。

写真語（wide-angle, golden hour, shallow depth of field）を使い、矛盾する画風を同時に入れない。
`
