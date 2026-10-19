// MiniMax H3 公式プロンプトガイドとコミュニティ知見を、KIE Studio の
// Grok プロンプト最適化向けに要約して埋め込む。
// 取得元:
// - https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md
// - https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md
// - https://dskjal.com/deeplearning/minimax-h3-prompt-guide
// - https://www.reddit.com/r/StableDiffusion/comments/1vwtrt1/

export const MINIMAX_H3_GUIDE_FILE_NAME = 'MiniMax_H3_Official_Prompt_Guide_JA.md'

export const MINIMAX_H3_GUIDE_CONTENT = `# MiniMax H3 プロンプト最適化ガイド

このガイドは MiniMax H3 公式 Video Prompt Writing Guide（base / ref）と、コミュニティ知見の要約を、KIE Studio のプロンプト生成・最適化用に整理したものです。ケーススタディの丸写しではなく、提出可能な本文へ再編成するための書き換え規則です。

## 最優先原則

1. ユーザーの意図、人物の数と同一性、因果、位置関係、台詞、結末を変えない。
2. 単なる言い換えではなく、選んだタスクに合う公式構造へ再編成する。
3. 出力は MiniMax H3 にそのまま渡せるプロンプト本文だけにする。分析、モデル ID、書き換え理由、API パラメータを含めない。
4. 原則として最善の1案だけを返す。
5. KIE Studio の Grok 最適化には素材バイナリが渡らず、文章と参照ラベルだけが渡る。素材を見たと主張せず、明記されていない外見・声・動作を素材番号へ割り当てない。
6. 尺・比率・解像度は生成パラメータであり、「6秒で」「2Kで」のように創作本文へ混ぜない。ただし公式のショット時刻と first/last 整列文はプロンプト本文の一部である。
7. 否定語で制御しない。不要な BGM は \`non_diegetic_music: N/A\` と書く。\`no music\` / \`don't change the face\` は使わない。
8. Hailuo 向けの短い自然文や、Seedance の \`@Image N\` 構造に書き換えない。

## KIE Studio の前提

カタログ上の MiniMax H3 は次の3 workflow。プロンプトは単一文字列（最大7000字）。尺は整数 4〜15 秒。解像度は 768P / 2K。

| KIE モデル | 公式タスク |
|---|---|
| \`minimax-h3/text-to-video\` | T2VA。参照ラベルは作らない。\`aspect_ratio\` は必須（adaptive 不可）だがプロンプトへ書かない。 |
| \`minimax-h3/image-to-video\` | first のみ → I2VA。first+last → FL2VA。last のみ → L2VA。 |
| \`minimax-h3/reference-to-video\` | full-reference。画像最大9、動画最大3、音声最大3。音声は画像または動画と併用必須。 |

Studio のメンションと公式ラベルは番号を揃えて併用する。Studio タグを消さず、存在しない番号を捏造しない。

| Studio | 公式 |
|---|---|
| \`@image1\` | \`<Picture 1>\` |
| \`@Video1\` | \`<Video 1>\` |
| \`@Audio1\` | \`<Audio 1>\` |

カスタムタグ（\`<Girl 1>\` / \`<Cloth 1>\` など）はユーザーが既に使っている場合のみ維持する。新規には \`<Subject N>\` / \`<Picture N>\` / \`<Video N>\` / \`<Audio N>\` を使う。

I2V の first/last は別フィールドのため、本文中の \`@image1\` が衝突することがある。タグ文字列は入力のまま残し、役割は整列文で「first frame / last frame」と明示する。

## タスクを最初に1つ選ぶ

- **同一性・顔の保持が必要** → reference-to-video（ref）。
- **T2V、または first/last フレーム補間で足りる** → base。コミュニティでは、十分な場合 FL2VA（base）の方が ref よりシャープになることがある。
- **通常は identity が要るなら ref**。引きの顔崩壊を抑えやすい。

1プロンプトに T2VA と ref の6節構造を混在させない。

## Base（T2VA / I2VA / FL2VA / L2VA）

T2VA は3フィールドから始める。I2VA / FL2VA / L2VA は**先頭1行の整列文**、空行、その後に3フィールド。

\`\`\`text
integrated_multimodal_description: [Shot 1] ...

overall_soundscape: ...

non_diegetic_music: ...
\`\`\`

### 整列文（先頭、I2VA / FL2VA / L2VA のみ）

I2VA（固定）:

\`\`\`text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.
\`\`\`

FL2VA: Picture 1 を 0.00 秒、Picture 2 を終端へ。ユーザーが尺を書いていれば \`S.SS\`（小数2桁）を使う。書いていなければ秒数を発明せず、last frame と書く。

\`\`\`text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the last frame of the target video.
\`\`\`

L2VA: 参照画像は最終ショットの着地であり、Shot 1 のものとは限らない。

\`\`\`text
How the reference pictures align with the target video — <Picture 1> (from [Shot N]) aligns with the last frame of the target video.
\`\`\`

- I2VA: 先頭フレームのスタイル・構図・人物を固定してから前方へ展開する（anchor → onset → development → result）。
- FL2VA: 2枚の静止画を再記述せず、その間の連続パスを書く。原則1ショット。複数ショットはユーザー指定時のみ。
- L2VA: 妥当な前状態から最終フレームへ収束させる。

## Ref（reference-to-video）

英語で次の6節をこの順に書く。台詞・歌詞・画面内文字だけ元言語を残す。

1. \`subject_definitions\`
2. \`summary\`
3. \`retention_analysis\`
4. \`detailed_description\`
5. \`overall_soundscape\`
6. \`non_diegetic_music\`

ラベルは定義してから使う。後続節で新しいラベルを発明しない。

### subject_definitions

- \`<Subject N>\`: 再利用する可視単位（人物、場所、服、小道具、ポーズ）。ソースファイルそのものではない。
- \`<Picture N>\`: その画像自体が first/last/keyframe / 構図アンカーのときだけ独立行にする。キャラ定義の出典なら Subject 行の中で引用する。
- \`<Video N>\`: 編集元、続き、カット/リズム/時間構造。動画内の人物は Subject。
- \`<Audio N>\`: コピーまたは参照する音。話者と結ぶときは既存の \`(S1)\` を再利用する。

キーフレーム:

\`\`\`text
<Picture 1> is the first frame of [Shot 1]
\`\`\`

声色:

\`\`\`text
<Audio 1> is the voice-timbre reference for <Subject 1> (S1)
\`\`\`

本文では \`from <Audio 1>\` のように使う。参照音声の台詞を、音色だけ借りるときにコピーしない。

**服・顔・小道具は別 Subject にする。** 1人の Subject に複数アセットを雑に束ねない。

誤: face は Video 1、jacket は Picture 1、backpack は Picture 2 を同一 \`<Subject 1>\` に列挙する。

正:

\`\`\`text
<Subject 1> is a man whose face comes from <Picture 1>: fully_preserved.
<Subject 2> is a black leather jacket whose appearance comes from <Picture 2>: fully_preserved.
<Subject 1> is wearing <Subject 2>.
\`\`\`

1枚に複数人: 左右を定義で固定する。\`<Subject 1> is the girl ... on the left in <Picture 1>.\`

見えるものだけ書く。定義に全身の服を書くとクローズアップしにくくなる（prompt bleed）。寄りと引きが必要ならショットを分けるか、ワイドのあと顔へズームする。

### summary

角括弧のタスク種別で始める。複数は \` + \` で結合し重複させない。

\`[reference generation]\` / \`[keyframe completion]\` / \`[video editing]\` / \`[video continuation]\` / \`[audio reuse]\` / \`[audio reference]\`

例: \`[reference generation + audio reference] The target video shows <Subject 3> in <Subject 1>...\`

動画があるだけで \`video editing\` にしない。カメラやリズムの参照は \`reference generation\`。直接編集・延長のときだけ editing / continuation。

### retention_analysis

ラベルごとに1行。可視: \`fully_preserved\` / \`partially_preserved\` / \`attribute_transfer\` / \`weak_reference\`。音声: \`fully_copy\` / \`partially_copy\` / \`reference\` / \`weak_reference\`。ここに \`(S1)\` は書かない。

\`\`\`text
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - identity, hair, and jacket are retained.
<Audio 1>: reference - vocal timbre guides <Subject 1> without copying the original signal.
\`\`\`

同一性を崩したくないときは \`fully_preserved\`。本文と矛盾すると本文が勝ちやすいので、定義・保持・ショット記述を揃える。

### detailed_description

生成タスクは目安 350〜500 語。会話が多いときは語数より発話タイムラインを優先する。スタイルは \`[Shot 1]\` の前に1〜2文。各ショットで構図、位置、動作、カメラ、音、参照ラベルの効きどころを具体的に書く。あらすじだけにしない。

## ショット・カメラ・台詞（base / ref 共通）

- \`[Shot 1]\` に時刻を付けない。以降は単調増加のカット時刻: \`[Shot 2] At 00:03.500, the camera cuts to...\`
- ユーザーが時刻や尺を書いていないなら、後続ショットへ秒数を発明しない。
- カットは新しい情報（被写体・空間・状態・視点・時間）のため。距離や角度の微変はカメラ動きを優先。
- カメラは自然な英語で **種類 + 振幅 + 速度**。中振幅・通常速度は省略してよい。
  - 種類: Zoom In/Out, Push In / Pull Out, Pan Left/Right, Truck Left/Right, Tilt Up/Down, Pedestal Up/Down, Arc Shot, Tracking Shot, Static Shot, Shake Slightly/Strongly, POV, Roll Clockwise/Counterclockwise
  - 振幅: \`with small amplitude\` / \`with large amplitude\`
  - 速度: \`at slow speed\` / \`at fast speed\`
  - 例: \`The camera pushes in with small amplitude at slow speed toward the folded letter.\`
- 左右は指定がなければ**カメラ基準**。演者基準は \`to her left\` / stage left。
- セミコロン \` ; \` はほぼピリオド。逐次は \`and\` / \`Then\`。同時は \`while\` / \`throughout\` / \`simultaneously\`。
- 物理は区別する: bounce / water-balloon / rubber-like elasticity は別挙動。
- 身長に \`small\` / \`smaller\` を使わない（子ども化しやすい）。年齢か \`short\` / \`shorter\`。
- 画角語（close-up, medium-wide, over the shoulder 等）は使える。Instagram Live はスマホ風、Sony Alpha A7iv は高品位寄りのスタイル指定としてコミュニティで使われる。
- 画面内文字は英語の二重引用符で原文のまま。

### 話者と台詞

- 発話する主体に安定 ID \`(S1)\` \`(S2)\`。同時発話は \`(S1,S2)\`。無発話キャラに ID を付けない。
- 話者を指定しないと別人が喋ることがある。
- 台詞は \`<d>[Language] 原文</d>\`。単語と句読点を改変・翻訳しない。
- 日本語: \`<d>[Japanese] 台詞</d>\`。中国語読みになるときはひらがな。半角スペースや \`、\` でテンポを調整する。
- 短い尺に台詞を詰めない（早口・欠落）。4〜15秒に収まる密度にする。
- リップシンクを明示するなら: \`Her lip movements perfectly synchronized with her words.\`
- オフスクリーンは英文を一字一句使う: \`says in an off-screen voiceover\`。直後に画面内の唇が閉じていることを書く。
- カットをまたぐ台詞は両側で継続を明示する（\`continues seamlessly across the cut\` 等）。
- ランダム発話を抑えたいとき: 話者を固定する。必要なら短い dialogue 定義。環境音だけなら ambience を書く。
- \`*\` 強調はピー音になることがある。重要語は大文字か括弧。

\`\`\`text
The young woman with a quiet, breathy voice (S1) says: <d>[English] I get off at the next station.</d>
The man (S1) says in an off-screen voiceover: <d>[English] I still remember that road.</d> while his lips remain completely closed.
<Subject 1> (S1) replies in the same clear youthful voice referenced from <Audio 1>, <d>[Japanese] 待って。</d>
\`\`\`

## 音

- \`overall_soundscape\`: 全編の環境音・動作音・非言語の人声を英語1〜4文。台詞・歌・ショット同期音は本文側。完全無音の指定があるときだけ \`N/A\`。
- \`non_diegetic_music\`: キャラに聞こえないBGM。楽器・テンポ・ダイナミクス。ムード語や感情解説は書かない。無ければ **\`N/A\`**（これが公式の「BGMなし」）。
- キャラに聞こえるラジオや生演奏はダイジェティックなので本文へ。
- soundscape に書いた内容が映像へ漏れやすい。映像として欲しくない事象を音の節に置かない。

## 最終確認

- タスクは T2VA / I2VA / FL2VA / L2VA / ref のどれか1つか。
- Studio の \`@imageN\` / \`@VideoN\` / \`@AudioN\` が残っているか。公式ラベルの番号が一致しているか。無い素材を足していないか。
- 台詞が原文のまま \`<d>[Language] ...</d>\` に入っているか。話者 ID があるか。
- BGM 不要なら \`non_diegetic_music: N/A\` か。否定文で消していないか。
- 服と顔を誤って同一 Subject に束ねていないか。見えない服を定義していないか。
- 4〜15秒に対して台詞とイベントが過密でないか。7000字を超える繰り返しがないか。
- 完成プロンプト本文のみか。
`
