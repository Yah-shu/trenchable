// 阿里雲 Model Studio 公式「文生视频 / 图生视频提示词指南」を、
// KIE Studio の Grok 最適化向けに要約して埋め込む。
// 取得元:
// - https://www.alibabacloud.com/help/en/model-studio/text-to-video-prompt
// - https://www.alibabacloud.com/help/zh/model-studio/text-to-video-prompt

export const WAN_GUIDE_FILE_NAME = 'Wan_Official_Prompt_Guide_JA.md'

export const WAN_GUIDE_CONTENT = `# Wan プロンプト最適化ガイド

阿里雲 Model Studio 公式の Wan 2.5 / 2.6 / 2.7 プロンプト公式を、提出用本文へ再編成する。Studio の \`@imageN\` / \`@VideoN\` は残し、公式の \`Image n\` / \`Video n\` を同じ番号で併用する。

## 最優先原則

1. 主タスクは T2V / I2V / マルチショット / 参照生成 / 編集のどれか1つ。
2. 無い素材番号を捏造しない。台詞はユーザー原文のまま。
3. 尺・比率・解像度は創作本文へ混ぜない。
4. 完成プロンプト本文のみ。

## 基本公式

\`\`\`text
Entity (appearance) + Scene + Motion (amplitude / speed) + Aesthetic control + Stylization
\`\`\`

I2V は画像が見た目を決める。本文は **Motion + Camera**。カメラ固定は \`fixed camera\`。

2.5 / 2.6 / 2.7 の音: 声 + 効果音 + BGM を時間に沿って書く。

- 台詞を書いたらその文言を変えない。書かなければモデルが勝手に喋る。
- 台詞なし: \`No dialogue.\` / 無台詞
- BGM なし: \`No background music.\` / 無背景音楽

## マルチショット（2.6 / 2.7）

\`Overall description + Shot N [start–end s] + shot content\`

\`\`\`text
A third-person short play about losing and regaining hope.
Shot 1 [0–3 s] A boy sits in a playground corner, looking down at a letter.
Shot 2 [4–6 s] Hard cut, fixed camera, close-up of his eyes.
Shot 3 [7–10 s] Hard cut to a classroom. A girl walks over to comfort him.
\`\`\`

単ショットにしたいとき 2.7 は \`Generate single shot.\` と書く（\`shot_type\` パラメータは 2.7 で廃止）。

1クリップ内の高速な場面転換、正確なリップシンク単語、画面内の正確な長文は公式に弱い。

## 参照（2.7）

公式英語: \`Image 1\` / \`Video 1\`（スペース、先頭大文字）。画像と動画は種類ごとに別番号。1点だけなら番号省略可。

\`\`\`text
The cat in Image 1 plays in the room in Image 2. No dialogue. No background music.
\`\`\`

2.6 参照は \`character1\` / \`character2\`（同時最大3）。各参照クリップは原則1キャラ。

複数話者: 一意のラベル、動作のあとに台詞、声色ラベル、順序語（Immediately）。代名詞で話者を切り替えない。

## Studio 対応

- \`@image1\` ↔ \`Image 1\`、\`@Video1\` ↔ \`Video 1\`
- 存在しない Image / Video 番号を足さない
- 編集（videoedit / V2V）は「何を A から B へ変えるか」と維持範囲を書く
`
