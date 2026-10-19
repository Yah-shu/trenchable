// OpenAI 公式 GPT Image prompting guide（GPT Image 2.5 含む）。
// 取得元:
// - https://developers.openai.com/api/docs/guides/image-prompting
// - https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide

export const GPT_IMAGE_GUIDE_FILE_NAME = 'GPT_Image_Official_Prompt_Guide_JA.md'

export const GPT_IMAGE_GUIDE_CONTENT = `# GPT Image プロンプト最適化ガイド

gpt-image-1 / 1.5 / 2 / 2.5 共通の公式パターン。背景 → 被写体 → 詳細 → 制約の順。用途（広告、UI、図解）を書いてモードを固定する。Flare と Sunburst はモデル選択であり、本文へ書かない。

## 最優先原則

1. 材料・形状・テクスチャ・メディア（photo / watercolor / 3D）を具体化する。
2. 実写が必要なら \`photorealistic\` を本文に含める。細かいカメラ型番は雰囲気程度。
3. 編集は \`change only X\` + \`keep everything else the same\`。不変リストを繰り返す。
4. 画面内文字は引用符または ALL CAPS。書体・サイズ・配置。難しい固有名詞は文字ずつ。
5. 複数入力は \`Image 1 (product): ... Image 2 (style): ...\`。Studio の \`@imageN\` があれば維持し番号を揃える。
6. 完成プロンプト本文のみ。quality / size / background / resolution / aspect_ratio は本文へ混ぜない。
7. 1回の編集で変えることは1つ。前回出力を次の入力にし、残す制約を毎回言い直す。

## 生成テンプレ

\`\`\`text
Scene / background.
Subject and pose.
Important visual details (materials, lighting, layout).
Use case (ad, UI mock, infographic, product cutout).
Constraints (no extra text, preserve identity, ...).
\`\`\`

複雑な依頼は1段落にせず短いラベル付き行に分ける。

## 人

全身が見えるか、視線、手の位置、他物体とのスケールを書く。

## 画面内テキスト

必要な文言は引用符で1回だけ指定し、位置とタイポを書く。余分な文字・透かし・無関係なロゴは入れないと明示する。

## 編集

「何を変えるか」と「何を残すか」（同一性、形状、レイアウト、照明、ラベル）を分ける。局所編集では彩度・コントラスト・カメラ角・周囲の物体も不変リストに入れる。

## 透明背景

ユーザーが切り抜きを求めたときだけ、被写体を無背景で孤立させ、風景・チェッカー・不要な影を入れないと書く。透過指定自体は API の background パラメータ側で行う。
`
