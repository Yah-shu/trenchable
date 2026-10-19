// Kling 公式 VIDEO 3.0 ユーザーガイドと 2.x 系の監督プロンプト構造を、
// KIE Studio の Grok 最適化向けに要約して埋め込む。
// 取得元:
// - https://kling.ai/quickstart/klingai-video-3-model-user-guide
// - https://kling.ai/blog/kling-video-3-omni-multi-shot-native-audio-guide

export const KLING_GUIDE_FILE_NAME = 'Kling_Official_Prompt_Guide_JA.md'

export const KLING_GUIDE_CONTENT = `# Kling プロンプト最適化ガイド

Kling 公式 VIDEO 3.0 ユーザーガイドを、KIE Studio の提出用プロンプトへ再編成するための規則です。2.x / 2.6 と 3.0 で構造を分ける。

## 最優先原則

1. 被写体 → 動き → 場面 → カメラ（1ショット1つ）→ 音 / スタイル、の順で書く。
2. \`@image1\` と \`@element_name\` は形式と番号を維持する。無い element を捏造しない。
3. 尺・解像度は創作本文へ混ぜない。
4. 完成プロンプト本文のみ。分析やモデル ID を書かない。

## 2.x / 2.6（単ショット）

公式に近い短い監督文。5〜10秒で完結する動き1つ。

\`\`\`text
[Subject] [Subject movement] in [Scene]. Camera: [one move]. Lighting / atmosphere.
\`\`\`

- I2V は見た目の再記述より「何がどう動くか」。
- カメラ複合（push + orbit + tilt）は避ける。
- 2.6 は native audio があるが、マルチショットの自動演出は 3.0 向け。2.x 本文に Shot 1/2/3 を詰め込まない。

## 3.0 / v3-turbo（マルチショット + 台詞）

3.0 は 3〜15秒。マルチショット、3人以上の話者、日英中韓西、方言・アクセント、画面内文字が公式機能。

- 単ショットで足りるなら Shot リストを発明しない。
- 複数カットが必要なら \`Shot 1, ... Shot 2, ...\` と画角・動き・秒数を書く。
- 台詞は話者を先に固定する: \`Mom (softly): ... Dad (low voice): ...\`
- 3.0 以外の言語の台詞は英語へ落ちることがある。日英中韓西で書く。
- 画面内文字は引用符で原文のまま。I2V の看板文字は「維持」と明示する。
- Element に声が既にバインドされているなら、本文で別音色を指定しない。

\`\`\`text
Outdoor terrace. A woman in a striped shirt sits opposite a man in a white T-shirt.
Shot 1, medium two-shot, slow zoom in as she swirls a glass and says "These trees will turn yellow in a month, won't they?".
Shot 2, close-up of the man, he lowers his head and says "but they'll be green again next summer.".
\`\`\`

## 避けること

- 空虚な cinematic / epic だけ
- 1クリップへ過密なカットと長台詞
- 参照タグの削除、element 名の付け替え
`
