// xAI 公式 Video Generation モードと、短い監督文の実務公式。
// 取得元:
// - https://docs.x.ai/developers/model-capabilities/video/generation
// コミュニティの長さ目安は公式の薄い箇所の補足であり、モード定義より優先しない。

export const GROK_IMAGINE_GUIDE_FILE_NAME = 'Grok_Imagine_Prompt_Guide_JA.md'

export const GROK_IMAGINE_GUIDE_CONTENT = `# Grok Imagine プロンプト最適化ガイド

xAI Grok Imagine はモードがフィールドで決まる（T2V / I2V / 参照 / 延長）。本文は短い監督指示。\`@image1\` を維持する。

## 最優先原則

1. 画像ワークフローなら構図・光・素材。動画なら **動き1つ + カメラ1つ + 音の手がかり**。
2. I2V はソース画像を再記述せず、変化する部分だけ。
3. 延長は最後のフレームの動きの向きを引き継ぎ、新しい秒だけを書く。
4. 空虚な cinematic を、push-in / orbit / tracking などのカメラ語に置き換える。
5. 完成プロンプト本文のみ。duration / resolution は本文へ混ぜない。

## 動画公式

\`\`\`text
[subject] + [one primary action] + [scene] + [camera] + [lighting] + [sound]
\`\`\`

目安 30〜80語。音は1パスで乗るので、欲しい環境音や短い台詞を明示する。話者を曖昧にしない。

## 画像

被写体先頭、光と材質、引用テキスト。参照編集は Image の役割を1つずつ。
`
