// PixVerse 公式 V6 レビューと社内プロンプト検証（3文 / 50–80語）を、
// KIE Studio の Grok 最適化向けに要約して埋め込む。
// 取得元:
// - https://pixverse.ai/en/blog/pixverse-v6-ai-video-generator-review
// - PixVerse official prompt testing (seven fixes; 50–80 words)

export const PIXVERSE_GUIDE_FILE_NAME = 'PixVerse_V6_Official_Prompt_Guide_JA.md'

export const PIXVERSE_GUIDE_CONTENT = `# PixVerse V6 プロンプト最適化ガイド

V6 は指示を字義どおりに読む。長いプロンプトほど主動作が埋もれる。公式検証では **50〜80語の3文** が最も制御しやすい。

## 最優先原則

1. 1文目に主体・動作・場所。重要なことは後段に回さない。
2. カメラ動きは1つ。積み重ねない。
3. cinematic / epic などの空虚語を、光・レンズ・物理に置き換える。
4. 制約は否定より肯定（\`hands remain stable\`）。本文の \`no jitter\` 連打を避ける。
5. I2V は画像を再記述せず、動き・カメラ・安定性。
6. \`@image1\` を維持する。尺・解像度は本文へ混ぜない。
7. 完成プロンプト本文のみ。

## 3文テンプレ

\`\`\`text
[Subject] + [one action] + [location].
[One camera movement] + [lens / lighting / material].
[What must stay stable] + [audio if needed].
\`\`\`

例: A glass perfume bottle stands on white marble as golden liquid settles inside. Slow macro push-in, warm side lighting, shallow depth of field, soft reflections. Bottle shape stays intact, label remains sharp. Quiet room tone.

## モード

- T2V: 見えるもの・聞こえるものを具体的に。
- I2V / transition: フレーム間の動き。
- extend: 境界の動きの方向を引き継ぎ、新しい出来事だけ書く。
- reference / fusion: 参照の役割を1つずつ。番号を付け替えない。

台詞と効果音が必要なら3文目に短く。短い尺に長台詞を詰めない。
`
