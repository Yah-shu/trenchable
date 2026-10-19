// Seedance_2.0_Complete_Prompting_Guide_JA.md から生成した埋め込みガイド。
// デスクトップ版はバンドル後のファイルパス解決に依存できないため、ガイド本文はコードに埋め込む。
// 内容を更新するときは scripts/embed-seedance-guide.mjs を再実行すること。

export const SEEDANCE_GUIDE_FILE_NAME = 'Seedance_2.0_Complete_Prompting_Guide_JA.md'

export const SEEDANCE_GUIDE_CONTENT = `# 🎬 Seedance 2.0 — 完全プロンプト作成マスターガイド 日本語版

> EvoLinkAI公式ガイド、Seedance公式プロンプト資料、主要コミュニティ資料をもとにまとめた、Seedance 2.0で本番品質のプロンプトを書くための総合リファレンスです。  
> ※日本語版では、Seedanceでそのまま使いやすい英語キーワード・タグ構文・プロンプト例は必要に応じて原語を残しています。

---

## 目次

1. [基本思想](#1-基本思想core-philosophy)
2. [6ステップ・プロンプト公式](#2-6ステッププロンプト公式)
3. [ショットスクリプト形式（上級）](#3-ショットスクリプト形式上級)
4. [@Tag参照システム](#4-tag参照システム)
5. [8つのカメラワーク](#5-8つのカメラワーク)
6. [速度・スタイル・ライティングキーワード](#6-速度スタイルライティングキーワード)
7. [ネガティブプロンプトと品質を落とす言葉](#7-ネガティブプロンプトと品質を落とす言葉)
8. [3つの生成モード](#8-3つの生成モード)
9. [上級テクニック](#9-上級テクニック)
10. [プロンプトテンプレート](#10-プロンプトテンプレートそのまま使える形式)
11. [10大得意領域](#11-10大得意領域)
12. [よくある失敗と修正方法](#12-よくある失敗と修正方法)
13. [パラメータ仕様](#13-パラメータ仕様)
14. [反復改善メソッド](#14-反復改善メソッド)
15. [動画延長と長尺チェーン](#15-動画延長と長尺チェーン)
16. [コミュニティ由来のプロンプトパターン](#16-コミュニティ由来のプロンプトパターン)

---

## 1. 基本思想（Core Philosophy）

**あなたは「描写する人」ではなく「監督」です。** Seedance 2.0は、実際の映像監督に話すような指示を理解します。プロンプトは、技術的なカメラ仕様の羅列ではなく、ショットリストのように書きます。つまり、シーン、動き、ムードを具体的に指示します。

Seedance 2.0は、**画像・動画・音声・テキストを同時に扱えるクアッドモーダル入力**をサポートするモデルです。内部では**Dual-Branch Diffusion Transformer**を使い、一方のブランチが空間情報（見た目）、もう一方が時間情報（どのように動くか）を扱います。

**重要な考え方:** あいまいなプロンプトは、両方のブランチに推測を強います。構造化されたプロンプトは両方に明確な情報を渡すため、結果が大きく安定します。

### Seedance 2.0が実際に理解しやすいこと

モデルは、次のような要素を理解しやすいです。

- **物理的な正確さ** — 物が落ちる、衝突する、布が垂れる、水が跳ねる、砂ぼこりが舞うなど、現実世界のルールに基づく相互作用
- **流体的な動き** — 勢い、慣性、タイミングのある自然な動き
- **精密な指示追従** — 複雑な複数ステップの指示を実行すること
- **スタイルの一貫性** — 全フレームを通して視覚的な統一感を保つこと
- **ネイティブ音声** — 効果音、台詞、音楽を映像に同期して生成すること

つまり、見た目だけでなく、**物理的な相互作用を描写する**のが大事です。たとえば “The tires smoke as the car drifts 90 degrees” と書けば物理エンジンに具体的な材料を渡せます。一方で “Car turns” だけでは弱いです。

### Edit と Reference の違いを理解する

既存動画をアップロードする場合は、必ず意図を明確にします。

- **Edit** = 既存動画そのものを直接変更する（キャラクターを差し替える、物を消す、展開を変えるなど）
- **Reference** = 動画から特定の性質だけを取り出し、新しい内容に適用する（カメラワーク、動きのスタイル、リズムなど）

\`\`\`
Edit:      "In @Video1, replace the woman with @Image1..."
Reference: "Reference @Video1's camera movement for a new scene..."
\`\`\`

---

## 2. 6ステップ・プロンプト公式

公式に推奨されている標準構造です。

\`\`\`
[Subject], [Action], in [Environment], camera [Camera Movement], style [Style], avoid [Constraints]
\`\`\`

| Step | 要素 | 必要な内容 | 例 |
|------|------|------------|----|
| **1. Subject** | 誰／何 | 具体的な見た目の特徴 | “A young woman in a white dress” |
| **2. Action** | 何が起きるか | 具体的な動詞、強さや量が分かる表現 | “Slowly turns around, breeze blowing the skirt” |
| **3. Environment** | どこで | ライティングと空気感も含める | “in a seaside at dusk, golden glow” |
| **4. Camera** | どう撮るか | 主要なカメラ指示は1つ | “camera slow push-in” |
| **5. Style** | 雰囲気 | 具体的な視覚参照 | “style cinematic film tone, 35mm” |
| **6. Constraints** | 避けたいこと | よくある破綻を除外 | “avoid jitter and bent limbs” |

**目標の長さ: 60〜100語。** 短すぎると情報不足になり、長すぎると指示が衝突します。

### 良い例／悪い例

**✅ 良い例:**
\`\`\`
A skateboarder lands a clean trick in an empty dawn parking lot,
camera low tracking shot then subtle rise, modern cinematic contrast,
6 seconds, 16:9, avoid jitter and bent limbs.
\`\`\`

**❌ 悪い例:**
\`\`\`
cool skateboard video, cinematic, fast, amazing tricks,
lots of movement, epic style
\`\`\`

---

## 3. ショットスクリプト形式（上級）

最も品質が高くなりやすいのは、ショットスクリプト形式です。トップクリエイターやバズ動画でよく使われる書き方です。

### 構造

\`\`\`
【Style】具体的なスタイルの基準（監督名／映画スタイル／アートムーブメントなど）
【Duration】合計尺

[00:00-00:04] Shot 1: ショット名（カメラ種別）
物理的なディテールを含むシーン描写。
具体的な身体動作を含むキャラクターアクション。
音のキュー。

[00:04-00:07] Shot 2: ショット名（カメラ種別）
...

[00:07-00:10] Shot 3: ショット名（カメラ種別）
...

一貫性の制約。物理挙動の条件。色調メモ。
\`\`\`

### なぜ効果が高いのか

1. **時間精度** — タイムコードにより、Seedanceが「いつ何が起こるか」を把握しやすくなります。タイムコードがないと、アクションが予測不能に分散しがちです。
2. **物語の流れ** — ショットに名前を付けることで、セットアップ → 発見 → ペイオフの構造が生まれます。感情の進行を伴う、より魅力的な動きになりやすいです。
3. **物理的な接地感** — “dust particles float in slow motion around the boots” のような詳細は、物理エンジンに具体的な制約を与えます。

### ショットスクリプト完全例

\`\`\`
【Style】Denis Villeneuve Sci-Fi Epic, IMAX 70mm, desaturated teal-orange palette.
【Duration】10 seconds

[00:00-00:04] Shot 1: The Scale (Extreme Wide Shot).
A lone astronaut in a white spacesuit stands at the edge of an enormous
crater on Mars. Red dust blows across the visor in gusts. The crater
stretches to the horizon — the scale of nature dwarfs the human figure
completely. Deep rumbling bass audio.

[00:04-00:07] Shot 2: The Discovery (Push-in to Close-up).
Camera slowly pushes from the wide shot into a tight close-up of the
astronaut's helmet visor. In the curved reflection, we see Earth — tiny,
blue, impossibly far away. The astronaut's breathing is audible.
Anamorphic lens flare streaks across the frame.

[00:07-00:10] Shot 3: The Decision (Low Angle, Static).
From below, the astronaut steps forward off the crater edge — a leap of
faith into the unknown. Dust particles float in slow motion around the
boots. Camera holds steady as the figure descends. Cut to black.

Consistent spacesuit design. Realistic Mars dust physics. Epic
orchestral audio swell on final shot.
\`\`\`

---

## 4. @Tag参照システム

これはSeedance 2.0のマルチモーダル性能を活かす重要機能です。ファイルをアップロードすると、それぞれに自動タグが割り当てられます。

### 2つの入口モード

| Mode | 使う場面 | 仕組み |
|------|----------|--------|
| **First/Last Frame Mode** | シンプルな単一ショット生成 | 開始画像、または終了画像として1枚をアップロードする。速くて分かりやすい。 |
| **Universal Reference Mode**（All-in-One Reference） | フルマルチモーダル制御 | 画像・動画・音声・テキストを組み合わせる。Seedanceの本領はこちら。 |

> ⚠️ **Dreamina UIメモ:** Seedance 2.0で使える入口は “First/Last Frame” と “All-in-One Reference” のみです。UI上に “Smart Multi-Frame” や “Subject Reference” が表示される場合がありますが、Seedance 2.0では選択できません。

### 構文ルール

| 種類 | タグ | 上限 |
|------|------|------|
| **Images** | \`@Image1\` 〜 \`@Image9\` | 最大9枚 |
| **Videos** | \`@Video1\` 〜 \`@Video3\` | 最大3本 |
| **Audio** | \`@Audio1\` 〜 \`@Audio3\` | 最大3本 |
| **Total** | — | 合計12ファイル以下 |

タグ番号は、各ファイル種別ごとの**アップロード順**で決まります。

> 🔑 **参照の黄金ルール:** どのファイルから、どの要素を抽出するのかを必ず明確にします。単にファイル名を出すだけでは不十分です。1つの参照動画からでも、動き、スタイル、カメラワーク、キャラクター外見、音声リズム、エフェクトなど複数の性質を抽出できます。何を使いたいのかを指定してください。
>
> \`\`\`
> ❌ Use @Video1 for the scene
> ✅ Reference @Video1 for camera movement only. Character appearance references @Image1.
> \`\`\`

### 画像参照の5つの使い方

| 用途 | プロンプト構文 | 効果 |
|------|----------------|------|
| 最初のフレーム | \`@Image1 as first frame\` | 動画がこの画像から始まる |
| 最後のフレーム | \`@Image1 as last frame\` | 動画がこの画像で終わる |
| キャラクター参照 | \`@Image1 as character reference\` | キャラクターの見た目を維持する |
| 環境参照 | \`@Image1 as background environment\` | 画像をシーン設定として使う |
| スタイル参照 | \`@Image1 as style reference\` | 色調、質感、ムードを合わせる |

### 動画参照の4つの使い方

| 用途 | プロンプト構文 | 効果 |
|------|----------------|------|
| カメラ再現 | \`follow @Video1 camera movement\` | パン、チルト、ズームなどのパターンをコピー |
| 動きの模倣 | \`character moves like @Video1\` | 振付やモーションを転写 |
| エフェクト再現 | \`apply @Video1 transition effects\` | 視覚効果やトランジションを合わせる |
| リズム参照 | \`match @Video1 pacing and cuts\` | タイミングやカット割りを同期 |

### 音声参照の3つの使い方

| 用途 | プロンプト構文 | 効果 |
|------|----------------|------|
| BGM | \`@Audio1 as background soundtrack\` | アップロード音源でムードを作る |
| 効果音 | \`@Audio1 as ambient sound\` | 特定の環境音・効果音を追加 |
| 声のスタイル | \`@Audio1 as voice style reference\` | 声質や話し方のテンポを合わせる |

### よく使う@Tag記述パターン

\`\`\`
# 最初のフレームを指定
Use @Image1 as the first frame of the scene, ...

# カメラワークだけ参照し、キャラクターは参照しない
Reference all camera movement effects from @Video1,
but use the character appearance from @Image1

# アクションとカメラを別々に参照
Reference character action from @Video1,
reference circular camera movement from @Video2

# 最初＋最後のフレームを指定（AIが間を補完）
@Image1 as the first frame and @Image2 as the last frame

# 動画延長
Extend @Video1 by 5s, [content description]

# 動画の効果音を参照
Background BGM references sound effects from @Video1
\`\`\`

### ファイル割り当て戦略

| 用途 | 画像 | 動画 | 音声 | 合計 |
|------|------|------|------|------|
| 商品CM | 4枚（商品アングル） | 1本（カメラ参照） | 1本（音楽） | 6 |
| キャラクターアニメーション | 3枚（キャラ＋シーン） | 2本（モーション参照） | 1本（音楽） | 6 |
| MV | 2枚（スタイル＋キャラ） | 2本（ダンス参照） | 3本（音源） | 7 |
| 複数ショットの物語 | 6枚（シーンキーフレーム） | 1本（スタイル参照） | 1本（音楽） | 8 |
| 最高品質の単一ショット | 9枚（全アングル） | 0本 | 3本（音声レイヤー） | 12 |

> **Tip:** 低品質な参照を大量に入れるより、少数の高品質な参照のほうが良い結果になりやすいです。

---

## 5. 8つのカメラワーク

カメラワークは、**動画品質を上げる最も効果的な要素**です。

| Camera Type | English Term | 効果 | 向いている用途 |
|-------------|--------------|------|----------------|
| **Push-in** | push-in / dolly in | カメラが被写体へ近づく | クローズアップ、感情の強調 |
| **Pull-out** | pull-out / dolly out | カメラが離れて全体を見せる | 環境の開示、空間説明 |
| **Pan** | lateral motion / pan | 水平方向に動く | 被写体追跡、風景のスキャン |
| **Tracking** | tracking shot / follow | 被写体に合わせて追従 | アクション、歩行シーン |
| **Orbit** | orbit / arc | 被写体の周囲を回る | 商品紹介、キャラポートレート |
| **Aerial** | aerial / drone shot | 高い位置から見る | 風景、都市、壮大なスケール |
| **Handheld** | handheld | 自然なわずかな揺れ | ドキュメンタリー感、リアリズム |
| **Fixed** | fixed / locked-off | カメラを完全に固定 | 被写体の動きに集中させる |

### 🚨 カメラ指示の重要ルール3つ

**Rule 1: 主要なカメラ指示は1つだけ。**
\`\`\`
✅ camera slow push-in
❌ camera push-in, then pan left, zoom out, orbit around
\`\`\`

複合的な動きが必要な場合は、主動作と副動作を分けて書きます。
\`\`\`
✅ camera low tracking shot then subtle rise
\`\`\`

**Rule 2: 技術仕様ではなく、リズムで説明する。**
\`\`\`
✅ slow, smooth, stable, gradual, gentle
❌ 24fps, f/2.8, ISO 800, focal length 85mm
\`\`\`

「編集者に話すようにリズムを説明する」と考えると書きやすいです。

**Rule 3: カメラの動きと被写体の動きを分ける。**
\`\`\`
✅ The dancer spins slowly. Camera holds fixed framing.
❌ spinning camera around a dancing person
\`\`\`

この2つを混ぜるのは最も多い失敗です。制御不能で揺れた動画になりやすくなります。

---

## 6. 速度・スタイル・ライティングキーワード

### 速度キーワード

| 速度 | キーワード | 効果 |
|------|------------|------|
| 極めて遅い | imperceptible, barely | ほとんど気づかないほど小さな動き |
| 遅い | slow, gentle, gradual | 滑らかで安定 |
| 中程度 | smooth, controlled | 自然なリズム |
| 速い | dynamic, swift | インパクトが強い（**扱い注意**） |

> ⚠️ “Fast” は品質を壊しやすいキーワードです。速さが必要な場合でも、速くする要素は1つだけにします。

### スタイルキーワード

| カテゴリ | キーワード | 効果 |
|----------|------------|------|
| Cinematic | cinematic, film tone, 35mm | 映画らしい見た目 |
| Quality | 4K, high detail, sharp | 高精細 |
| Film | film grain, analog, vintage | レトロな粒状感 |
| Tone | warm tone, cool palette, desaturated | 色調の方向性 |
| Atmosphere | moody, dreamy, ethereal | 感情的な空気感 |
| Realism | realistic, natural, documentary | 現実感 |

### ライティングキーワード（最重要）

**品質を上げるために1つだけ要素を足せるなら、ライティングを足してください。**

| キーワード | 効果 | 例 |
|------------|------|----|
| golden hour | 暖かい金色の光 | “soft golden hour lighting” |
| rim light | 被写体の輪郭を光で強調 | “dramatic rim light against dark bg” |
| natural light | 自然光 | “soft natural window light” |
| neon | ネオンの発光 | “neon-lit rainy street” |
| backlit | 逆光 | “backlit silhouette at sunset” |
| overcast | 柔らかい拡散光 | “even overcast diffused light” |

### キーワードで発火しやすい特殊効果

| 欲しい効果 | 推奨表現 |
|------------|----------|
| ヒッチコックズーム | \`protagonist in panic with Hitchcock zoom\` |
| 円形カメラ | \`robotic arm multi-angle circular movement\` |
| 加速感 | \`speed accelerates like a roller coaster\` |
| パーティクル | \`golden sand particles scatter\` / \`particle dispersion effect\` |

---

## 7. ネガティブプロンプトと品質を落とす言葉

### 必須ネガティブプロンプト（基本的に毎回入れる）

| Negative Prompt | 除外するもの | 使う場面 |
|-----------------|--------------|----------|
| \`avoid jitter\` | 画面の揺れ | すべての動画 |
| \`avoid bent limbs\` | 曲がった手足・破綻した関節 | キャラクター動画 |
| \`avoid temporal flicker\` | 時間方向のちらつき | 長めの動画 |
| \`avoid identity drift\` | 被写体の特徴の変化 | キャラクター一貫性 |
| \`avoid chaotic composition\` | 散らかった構図 | 複雑なシーン |

### 品質を壊しやすい言葉

| 危険な言葉 | なぜ危険か | 代わりに使う表現 |
|------------|------------|------------------|
| \`fast\` 単体 | 全体が混乱しやすい | 速くする要素を1つに絞る |
| \`cinematic\` 単体 | あいまいすぎる | “cinematic film tone, 35mm, warm” |
| \`epic\` | モデルが具体化しづらい | 見せたい視覚効果を具体的に書く |
| \`amazing\` / \`beautiful\` | 実用的な指示にならない | 具体的な光・構図を書く |
| \`lots of movement\` | ジッターの原因になる | 1つの具体的な動きに絞る |

---

## 8. 3つの生成モード

### Text-to-Video

6ステップ公式をすべて使います。画面内の要素をきちんと説明します。

\`\`\`
A lone astronaut walks across an amber desert under twin moons,
camera slow lateral tracking, cinematic sci-fi tone, 8 seconds,
16:9, avoid temporal flicker.
\`\`\`

### Image-to-Video

画像内にすでに写っているものを再説明しすぎないこと。**動きとカメラ**に集中します。

\`\`\`
Animate the provided image, preserve composition and colors,
add gentle wind motion to the leaves, camera slowly pushes in,
keep consistent lighting, 6 seconds.
\`\`\`

### Video-to-Video

元の動きを保ちながら、**スタイル変換**を説明します。

\`\`\`
Transform source clip to anime watercolor style,
preserve core motion and timing, adjust color palette to pastel,
keep identity consistent, avoid identity drift.
\`\`\`

| 要素 | Text-to-Video | Image-to-Video |
|------|---------------|----------------|
| 被写体説明 | 詳細に必要 | 画像にあるので省略気味でよい |
| 動きの説明 | 全体を説明 | 変化する部分に集中 |
| 構図の維持 | 該当なし | “preserve” を強調する |
| カメラワーク | 柔軟に指定 | 画像の構図に合うものを指定 |

---

## 9. 上級テクニック

### 長い動画（10秒以上）: タイムライン分割を使う

\`\`\`
0-3s: [冒頭の説明]
3-6s: [中盤の動き]
6-10s: [クライマックス／終わり]
\`\`\`

### アクションと感情は具体的にする

\`\`\`
❌ character is very sad
✅ tears slide down cheeks, mouth trembles slightly
\`\`\`

### ワンカット動画

プロンプトの最後に次を入れます。

\`\`\`
No scene cuts throughout, one continuous shot.
\`\`\`

完全例:

\`\`\`
@Image1 @Image2 @Image3, first-person one continuous tracking camera,
movement trajectory: from street through alley to rooftop,
speed gradually accelerates then slows at the peak.
No scene cuts throughout, one continuous shot.
\`\`\`

### 複数動画にまたがるキャラクター一貫性

1. 毎回**同じ参照画像**を \`@Image1 as character reference\` として使う
2. 画像参照があっても、見た目の記述を明示する: “same red jacket, short black hair”
3. 動画Nの最後のフレームを、動画N+1の最初のフレーム画像として使う

### カメラワーク再現

\`\`\`
Reference all camera movement effects from @Video1,
but use the character appearance from @Image1
\`\`\`

再現が弱い場合は、次のように強めます。

\`\`\`
completely reference all camera movement effects from @Video1
\`\`\`

### 動画延長

\`\`\`
Extend @Video1 forward by 5s.
0-2s: [continuing scene description].
2-5s: [new action/ending].
\`\`\`

注意: Durationは合計尺ではなく、**新しく生成する秒数**です。

### 音楽ビート同期

音声をアップロードして、映像を同期させます。

\`\`\`
Background music references @Audio1. Visuals sync to the beat rhythm.
Camera cuts and movement changes align with musical beats.
\`\`\`

### 動画結合（2つのクリップの間に挿入）

既存の2本の動画の間に、新しいシーンを挿入できます。

\`\`\`
I want to add a scene between @Video1 and @Video2, with the content 
being [description of the bridging scene].
\`\`\`

### 連続アクションチェーン

複雑な複数ステップの物理アクションでは、遷移を明示します。

\`\`\`
The character transitions directly from jumping to rolling, 
maintaining smooth and fluid motion throughout.
\`\`\`

### マルチカメラ・ナラティブ（自動ショットカバー）

Seedance 2.0は、1回の生成内で複数カメラアングルを作れます。会話やシーンを説明すると、ショット・リバースショット、ワイドの状況説明、キャラクターのクローズアップ、ミディアムショットなどを自動で構成できます。

\`\`\`
A conversation between two characters sitting across from each other 
at a cafe table. They discuss the plan with increasing tension. 
Natural multi-camera coverage with shot-reverse-shot editing.
Character details stay consistent across cuts.
\`\`\`

### 音声参照がない場合: 動画の音を使う

個別の音声ファイルがない場合は、既存動画の音を参照できます。

\`\`\`
Background BGM references the sound effects from @Video1.
\`\`\`

---

## 10. プロンプトテンプレート（そのまま使える形式）

### Template 1: 商品360°ショーケース

\`\`\`
@Image1 [product name] as the main subject,
camera movement references @Video1,
zoom in to close-up of [specific part],
camera rotates and [product] flips to show full view,
[product feature details] clearly visible,
surrounding environment [atmosphere description]
\`\`\`

### Template 2: 広告比較

\`\`\`
This is a [product] advertisement, @Image1 as the first frame,
[character A] in [state A, e.g.: elegant],
camera quickly pans right, shooting @Image2 [character B] [state B, e.g.: disheveled],
camera pans left and zooms in shooting [product],
[product] references @Image3, [product] in [working state].
\`\`\`

### Template 3: 動画延長スクリプト

\`\`\`
[N]s
Extend @Video1 [forward/backward] by [N] seconds.
[0-X]s: [scene description].
[X-Y]s: [scene description].
[Y-N]s: [ending scene/subtitles].
\`\`\`

### Template 4: ワンカット

\`\`\`
@Image1 @Image2 @Image3..., [perspective] one continuous shot [movement type] camera,
[movement trajectory: from A through B to C], [speed/rhythm changes].
No scene cuts throughout, one continuous shot.
\`\`\`

### Template 5: 映画的なレースシーン（ショットスクリプト）

\`\`\`
【Style】Hollywood Professional Racing Movie (Le Mans Style), Cinematic Night, Rain, High Stakes.
【Duration】10 seconds

[00:00-00:03] Shot 1: The Veteran (Interior/Close-up).
Rain hammers the windshield of a high-tech race car on a night track.
Inside the cockpit, the veteran driver in a black helmet looks sideways
at his rival. Dashboard instruments glow green on his visor.
He gives a subtle nod and mouths 'Let's go.'

[00:03-00:06] Shot 2: The Challenger (Interior/Close-up).
Cut to the rival car. A younger driver grips the steering wheel with
white knuckles. Raindrops streak across the side window. Eyes wide with
adrenaline through the visor slit.
He whispers 'Focus' to himself.

[00:06-00:10] Shot 3: The Green Light (Wide Action Shot).
Starting lights turn GREEN. Both cars launch forward in sync on gleaming
wet asphalt. Massive water rooster tails spray behind them. Rain hits
the camera lens. Motion blur turns stadium lights into long golden streaks.

Consistent car designs. Realistic rain physics, water reflections.
Tension-building audio.
\`\`\`

### Template 6: アニメキャラクターの感情表現

\`\`\`
【Style】High-quality anime, Studio Ghibli-inspired, detailed facial expressions.
【Duration】12 seconds

[00:00-00:04] Shot 1: The Letter Arrives (Medium Close-up).
A young anime girl with long black hair sits by a sunlit window.
She holds an unopened envelope with both hands, turning it over carefully.
Her eyes show curiosity mixed with anticipation. Soft morning light.

[00:04-00:08] Shot 2: The Reading (Close-up on Face).
She opens the letter and begins reading. Her expression changes —
eyes widening with surprise, then a slow smile spreading.
Her lips part slightly as if to gasp.

[00:08-00:12] Shot 3: The Joy (Medium Shot, Slight Pull Back).
She clutches the letter to her chest and closes her eyes with happiness.
A single tear of joy rolls down her cheek. Cherry blossom petals drift
past the window behind her.

Consistent anime character design. Detailed emotional facial animation.
Natural lighting transitions.
\`\`\`

### Template 7: 商品CM（Image-to-Video）

\`\`\`
@Image1 as first frame.
【Style】Premium product keynote, clean minimal aesthetic.
【Duration】15 seconds

[00:00-00:03] Rapid four-frame flash cuts — black, blue, white, rose gold
product variants appear one by one. Close-up on texture and finish.

[00:03-00:08] Extreme close-up of mechanism unfolding. Precision engineering
visible in slow motion. Studio lighting creates elegant highlights.

[00:08-00:12] Quick-cut lifestyle montage. Different users in different settings,
each wearing/using the product variant matching their aesthetic.

[00:12-00:15] All variants lined up on minimal white pedestal.
Brand text elegantly fades in at bottom.

Maintain exact product proportions from @Image1.
Commercial-grade lighting. Clean, premium aesthetic throughout.
\`\`\`

### Template 8: ASMR / 感覚系コンテンツ

\`\`\`
Create a vertical ASMR video with no music, focusing on macro details.
A light blue skincare gel bottle sits on glass. A pale, elegant hand
gently taps the glass, producing crisp fingernail tapping sounds.
The hand picks up the bottle and slowly twists the cap, with the
rotation sound clearly audible. A spoon scoops a portion of gel and
drops it onto the glass with a soft "plop," showing dense gel with
tiny air bubbles. Dramatic cool lighting from behind makes the gel
glow like a gemstone. The hand presses onto the gel, spreading it
in circular motions, causing tiny bubbles to swirl.
\`\`\`

---

## 11. 10大得意領域

EvoLinkAI公式ガイドに基づくと、Seedance 2.0は次の10領域を得意とします。

| # | Capability | 説明 |
|---|------------|------|
| 01 | **Consistency Enhancement** | 顔、服、商品ディテール、文字、シーンのフレーム間一貫性 |
| 02 | **Camera Movement & Action Replication** | 参照動画から複雑なカメラワークや振付を再現 |
| 03 | **Creative Effects Replication** | 参照からトランジション、パーティクル、スタイル変換を再現 |
| 04 | **Story Completion** | 最小限の画像や音声入力から物語の隙間を補完 |
| 05 | **Video Extension** | 自然な遷移でクリップを前後に延長 |
| 06 | **Audio & Voice** | リアルな効果音、正確なリップシンク、声色再現 |
| 07 | **One Continuous Shot** | 複数の画像・動画参照を使った長いワンカット |
| 08 | **Video Editing** | 脚本反転、キャラクター差し替え、局所的な修正 |
| 09 | **Music Beat Sync** | リズムを理解し、映像を音楽のビートに合わせる |
| 10 | **Emotion Performance** | 微細な表情、身体言語、感情のタイミング |

---

## 12. よくある失敗と修正方法

| # | 失敗 | なぜ失敗するか | 修正 |
|---|------|----------------|------|
| 1 | あいまいすぎる（“nice video of dog”） | モデルが全部推測する | 犬種、動き、カメラ、場所を指定 |
| 2 | @tag番号の間違い | 存在しない参照を指定する | アップロード順を確認。タグは1から始まる |
| 3 | 尺や解像度の指定なし | デフォルトが意図とズレる | プロンプトとパラメータの両方で指定 |
| 4 | モダリティの衝突 | 画像は昼、プロンプトは “dark night” | 参照内容とプロンプトを揃える |
| 5 | 詰め込みすぎ（200語以上） | 重要指示が薄まる | 150語未満に抑え、見た目は参照で補う |
| 6 | カメラ指示なし | 静止、またはランダムな動きになる | “slow dolly-in” や “static wide” を追加 |
| 7 | 実写の顔写真をアップロード | コンプライアンスフィルターで止まりやすい | イラスト調、スタイライズキャラを使う |
| 8 | ファイル上限超過 | リクエストが拒否される | 画像≤9、動画≤3、音声≤3、合計≤12 |
| 9 | スタイルアンカーなし | 汎用的な出力になる | 監督名、映画、アートスタイルなどで固定 |
| 10 | タイムコードなし | アクションのタイミングが不安定 | \`[00:00-00:05]\` 形式を使う |
| 11 | fast + fast + 複雑 | 高確率でジッターが出る | 速い要素は1つだけ |
| 12 | カメラと被写体の動きを混ぜる | 揺れて破綻しやすい | それぞれ別々に説明 |

---

## 13. パラメータ仕様

### 入力制限

| 入力タイプ | 形式 | 数量 | サイズ上限 | 尺 |
|------------|------|------|------------|----|
| Image | JPEG, PNG, WebP, BMP, TIFF, GIF | ≤ 9 | 各30MB未満 | — |
| Video | MP4, MOV | ≤ 3 | 各50MB未満 | 合計2〜15秒 |
| Audio | MP3, WAV | ≤ 3 | 各15MB未満 | 合計15秒以下 |
| Text | 自然言語 | — | — | — |
| **Combined** | — | **合計12ファイル以下** | — | — |

### 出力仕様

- 生成尺: **4〜15秒**（自由に選択）
- 解像度: 最大 **2K**
- 含まれるもの: 効果音 + BGM
- 音声: ステレオ、8言語以上でリップシンク

### コンプライアンス

- ❌ 実写の人間の顔写真はサポートしません（ByteDanceはプライバシー懸念後、“Face-to-Voice” 機能を停止。人間の参照入力にはより厳しい検証があります）
- ✅ 推奨: イラスト調、AI生成の仮想キャラクター、動物、商品、シーン
- ⚠️ 参照動画を使う生成は、画像のみ・テキストのみの生成より多くのクレジットを消費します

### 生成後ツール（Dreamina UI）

生成後、再生成せずに調整できます。

- **“Generate soundtrack”** — ワンクリックで生成動画に音声を追加／差し替え
- **“Interpolate frames”** — フレーム補間で動きを滑らかにする
- **“Regenerate”** — 同じプロンプトで別バリエーションを再生成

### プラットフォーム別アスペクト比

| Platform | Aspect Ratio | メモ |
|----------|--------------|------|
| YouTube / landscape | 16:9 | 映画的なコンテンツの標準 |
| TikTok / Reels / Shorts | 9:16 | プロンプトに “vertical format, 9:16” を追加 |
| Instagram feed | 1:1 | 正方形 |
| Vintage / retro aesthetic | 4:3 | クラシックTV比率 |
| Cinematic widescreen | 2.35:1 | スタイル行に “2.35:1 widescreen” を追加 |

延長チェーンでは、すべてのクリップで**同じアスペクト比**を使います。

### 入力品質の推奨

| 入力タイプ | 最低推奨品質 | なぜ重要か |
|------------|--------------|------------|
| Images | 1080p以上、明るく、シャープ | 低解像度・ぼやけた画像は出力も荒れやすい |
| Videos | 安定した映像、明るい、動きが明確 | 揺れた暗い参照は、出力も揺れて暗くなりやすい |
| Audio | 256kbps以上、ノイズが少ない | こもった音はビート同期やリップシンクを悪化させる |
| Asset count | まず2〜4素材から始める | 多ければ良いわけではない。量より品質 |

### よくある問題のトラブルシュート

| 問題 | 原因 | 解決策 |
|------|------|--------|
| ショット間でキャラクターが変わる | アイデンティティ固定が弱い | “maintain consistent facial features and clothing from @Image1 throughout entire video” を追加 |
| 動きが参照と合わない | 参照指示があいまい | “Exactly replicate the camera movement from @Video1, smooth tracking left to right” のように具体化 |
| 映像が音のビートに乗らない | 同期指示がない | “camera movements and transitions hit beats in @Audio1” を追加し、同期点を指定 |
| 途中でスタイルが変わる | スタイル固定が弱い | “Visual style from @Image1 applies to entire duration, consistent color grading” のように複数回固定 |
| 延長部分のつなぎ目が不自然 | 前クリップの終点状態を説明していない | 前クリップ末尾の状態を説明してから延長内容を書く |

---

## 14. 反復改善メソッド

### 「1回に1変数だけ」ルール

1. **Baseline:** 標準プロンプトで2〜3案を生成
2. **1要素だけ調整:** カメラ角度、動きの強さ、スタイルのどれか1つ。複数同時に変えない
3. **Score:** 連続性、指示追従、後編集で使えるかを評価
4. **Select:** 最もスコアが高い案を選ぶ
5. **Repeat:** 次の変数を調整する

### 3段階テンプレート管理

| Tier | 目的 | 特徴 |
|------|------|------|
| Starter | 方向性を素早く検証 | 短く正確 |
| Production | 本番納品 | カメラと一貫性制約を厳密にする |
| Fallback | 出力が不安定なとき | 極力シンプルに戻す |

### 公開前チェックリスト

- [ ] 第三者目線でプロンプト全体を読む
- [ ] 冗長な形容詞を削る
- [ ] 主要カメラ指示が1つだけか確認
- [ ] 制約が実現可能か確認
- [ ] スタイルと動きが衝突していないか確認
- [ ] @tag番号がアップロード順と合っているか確認
- [ ] ネガティブプロンプトを入れる（avoid jitter, bent limbs）
- [ ] 少なくとも1つライティング説明を入れる
- [ ] 動画アップロード時、editなのかreferenceなのかが明確か確認

### 実制作での活用例

| 用途 | ワークフロー |
|------|--------------|
| **商品ラインナップ展開** | 1つのヒーローCMを生成 → 動画編集で商品だけSKUごとに差し替え。カメラは同じ、5バリエーションを1生成から展開。 |
| **コンテンツのローカライズ** | ベース動画を生成 → 音声参照で別言語リップシンク版を再生成。1つの撮影から多市場展開。 |
| **絵コンテ → 動画** | 絵コンテのパネルを参照画像としてアップロード → 構図、カメラ角度、トランジションを直接理解させる。 |
| **テンプレート型シリーズ** | バズ動画のスタイルを参照動画としてアップロード → 自分のキャラや商品で同じ型を生成。シリーズ全体で一貫性を保つ。 |
| **段階的なシーン構築** | まず基本シーンを生成 → オブジェクトやキャラクターを1つずつ追加。全部を一度に指定するより制御しやすい。 |
| **惜しい生成の修正** | 90%完璧だが邪魔な要素がある場合、再生成ではなく要素削除で消す。良かった部分を失わない。 |

---

## 15. 動画延長と長尺チェーン

> 15秒を超える動画を、複数生成のチェーンで自然につなげる方法です。  
> Source: Opus.pro Seedance extension guide + EvoLinkAI official documentation.

### 基本コンセプト

Seedance 2.0の生成ウィンドウは**1クリップあたり4〜15秒**です。30秒、60秒、90秒以上の長尺動画を作るには、**延長をチェーン**します。各生成は前の出力から自然に続きます。モデルは前クリップ全体の軌跡（動き、光、構図、スタイル）を分析するため、単に最後のフレームだけでつなぐよりも連続感が出ます。

延長回数に明確なハード上限はありません。1回ごとに4〜15秒の新規映像を追加できます。

### チェーンのワークフロー

\`\`\`
CLIP 1: 初回生成（text-to-video または image-to-video）→ 15s
CLIP 2: Clip 1の出力を @Video1 としてアップロード → "Continue from @Video1..." → +10s
CLIP 3: Clip 2の出力を @Video1 としてアップロード → "Continue from @Video1..." → +10s
CLIP 4: Clip 3の出力を @Video1 としてアップロード → "Continue from @Video1..." → +10s
= 45秒の連続動画
\`\`\`

### チェーンの重要ルール

**Rule 1: 延長プロンプトは「次に起きることだけ」を書く。**  
すでに起きたことを再説明しないでください。次のシーンを監督する感覚で書きます。

\`\`\`
❌ "The man was walking through the city and now he enters a cafe..."
✅ "Continue from @Video1. The man pushes open the cafe door and steps inside. Warm interior lighting replaces the cool street light. Camera follows him to a table."
\`\`\`

**Rule 2: すべての延長プロンプトは継続コマンドから始める。**

\`\`\`
Continue from @Video1. [new scene description]
\`\`\`
または
\`\`\`
Extend @Video1 forward by [N] seconds. [new scene description]
\`\`\`

**Rule 3: すべての延長で連続性指示を明示する。**

チェーンが長くなるほどモデルはドリフトします。視覚アンカーを毎回補強します。

\`\`\`
Continue from @Video1. Maintain the exact same lighting angle, color 
temperature, and character appearance from the previous clip. [then 
describe the new action]
\`\`\`

**Rule 4: すべてのクリップで同じアスペクト比を使う。**  
比率が違うと自然につながりません。Clip 1が16:9なら、すべての延長も16:9にします。

**Rule 5: 3〜6回の延長は一貫性を保ちやすい。**  
合計30〜90秒程度ならかなり安定します。6チェーンを超えるとドリフトリスクが上がるため、元生成の視覚プロパティを再アンカーしたり、元のキャラクター参照画像を再アップロードしたりします。

### 延長プロンプト公式

\`\`\`
Continue from @Video1.
[次に起きること — 新しいアクション、新しいカメラ指示、新要素]
[連続性アンカー — "maintain same lighting/character/style"]
[Duration: Ns]
\`\`\`

### 長尺スクリプト形式（複数クリップを書く場合）

15秒を超える動画を依頼された場合は、次のように番号付きクリップで書くと管理しやすいです。

\`\`\`
════════════════════════════════════════
CLIP 1 — INITIAL GENERATION (15s)
Mode: Text-to-Video (or Image-to-Video with @Image1)
════════════════════════════════════════

[【Style】【Duration】とタイムコード付きの完全プロンプト]

════════════════════════════════════════
CLIP 2 — EXTENSION FROM CLIP 1 (10s)
Mode: Upload Clip 1 output as @Video1
════════════════════════════════════════

Continue from @Video1. [new scene description]
Maintain exact same [lighting/character/style] from previous clip.

════════════════════════════════════════
CLIP 3 — EXTENSION FROM CLIP 2 (10s)
Mode: Upload Clip 2 output as @Video1
════════════════════════════════════════

Continue from @Video1. [new scene description]
Maintain exact same [lighting/character/style] from previous clip.

... and so on
\`\`\`

### 作業手順

1. **Clip 1を生成** — 最初のプロンプトを使う
2. **結果を確認** — 良ければ出力をダウンロード
3. **その出力を @Video1 として新規生成にアップロード**
4. **Clip 2プロンプトを貼る** — 次に起きることだけを書く
5. **生成** — モデルがClip 1の終点から自然に続ける
6. **以降のクリップで繰り返す**
7. **全クリップを動画編集ソフトで結合**（プラットフォーム内延長ならすでに1本としてつながる場合もあります）

### 高度な延長テクニック

**Reference-Guided Extension:**  
継続元の動画に加え、新しい参照動画でカメラワークを指定できます。

\`\`\`
Continue from @Video1. Use @Video2 as a reference for the camera 
movement in this extension — replicate the spiral descent from @Video2 
while continuing the scene from @Video1.
\`\`\`

**Style Evolution Through Extension:**  
チェーン全体で意図的にムードを変化させる方法です。

\`\`\`
Continue from @Video1. The lighting gradually transitions from warm 
daylight to cool blue twilight as the camera pushes forward. The 
atmosphere becomes more mysterious. Maintain character appearance.
\`\`\`

**A/B Branching:**  
Clip 1を生成したあと、そこから2つの異なる方向に延長します。片方はドラマチック、もう片方は控えめなど。同じ出発点から別エンディングを試し、良い方を採用します。

**Seamless Looping:**  
Webサイト背景動画などでは、最初の構図へ戻るように延長してループを作れます。

\`\`\`
Continue from @Video1. The camera completes the full orbit, returning 
to the exact same angle, lighting, and composition as the first frame 
of the original video to create a seamless loop.
\`\`\`

### 動画編集（再生成せずに変更）

延長だけでなく、既存クリップを最初から作り直さずに編集できます。

**キャラクター差し替え:**
\`\`\`
In @Video1, replace the woman with @Image1. Keep all camera movement, 
lighting, background, and timing exactly the same. Only the character 
identity changes.
\`\`\`

**要素追加:**
\`\`\`
In @Video1, add @Image1 (a coffee cup) to the right side of the desk. 
It should be lit consistently with the existing scene. Everything else 
unchanged.
\`\`\`

**要素削除:**
\`\`\`
In @Video1, remove the plant from the left corner. Fill the area with 
a continuation of the wall. Keep everything else unchanged.
\`\`\`

**展開の反転／サブバート:**
\`\`\`
Subvert the plot in @Video1. [describe the new narrative direction 
along a timeline: 0-3s / 3-6s / 6-9s...]
\`\`\`

### 延長尺のルール

- 指定したDuration = **新しく生成される秒数**であり、合計尺ではありません
- 10秒の動画を5秒延長すると、5秒の新規映像が得られます（結合後は合計15秒）
- 延長内でも “0-3s: [action] / 3-6s: [action]” のような時間指定を使うと滑らかです
- “extend forward”（後ろに続ける）か “extend backward”（前に追加する）を指定します

### ドリフト防止チェックリスト

3回以上チェーンする場合は、毎回入れると安定します。

- [ ] “Maintain the exact same character appearance from the original”
- [ ] “Keep consistent lighting angle and color temperature”
- [ ] “Same visual style and color palette throughout”
- [ ] ドリフトが出たら、元のキャラクター参照画像を @Image1 として再アップロード
- [ ] すべてのクリップで同じアスペクト比を維持

---

## クイックリファレンスカード

\`\`\`
FORMULA:  Subject + Action + Environment + Camera + Style + Constraints
LENGTH:   60-100 words
CAMERA:   ONE primary instruction + pacing words (slow/smooth/gentle)
LIGHTING: Always include one lighting description (highest leverage)
NEGATIVE: "avoid jitter and bent limbs" on every character video
TIMECODES: Use [00:00-00:05] for videos > 5 seconds
STYLE:    Anchor to specific director/film/art movement
REFS:     @Image1-9, @Video1-3, @Audio1-3 (≤12 total)
ACTIONS:  Specific verbs, physical details, NOT abstract adjectives
SPEED:    Only ONE element can be "fast" at a time
PHYSICS:  Describe physical interactions ("tires smoke") not just appearance
SPECIFY:  State WHICH element to extract from WHICH file (motion/camera/style)
INTENT:   Always clarify "edit @Video1" vs "reference @Video1" — they're different
EXTEND:   "Continue from @Video1." + new scene + continuity anchors
CHAIN:    Max 15s per clip → chain 3-6 extensions for 30-90s total
DURATION: Extension duration = NEW seconds only, not total
DRIFT:    Re-anchor character/lighting/style every 2-3 extensions
\`\`\`

---

## 16. コミュニティ由来のプロンプトパターン

> **EvoLinkAI/awesome-seedance-2.0-prompts** リポジトリ由来のパターンです。公開X投稿をもとに整理・翻訳された164件のキュレーション済みコミュニティプロンプトから抽出されています。ここでは、実際に強い結果が出ている書き方の傾向を、Sections 1〜15の代替・補助パターンとしてまとめます。

### 16.1 JSON風の構造化プロンプト形式

ショットスクリプト形式の代替です。コンパクトで機械可読性があり、テンプレート化したり、文章的な装飾を削ったりしたい場合に便利です。VFX寄り、POV寄りのプロンプトに強いです。

\`\`\`json
{
  "location": "Tokyo Cityscape (Night)",
  "duration": "10s",
  "prompt": "A cinematic POV shot riding an invisible rollercoaster through Tokyo at night. A glowing neon rail 'creates itself' milliseconds before the camera hits it, weaving through Tokyo Tower. Each building it touches transforms into stacks of glowing cubes that rotate and re-assemble. Shot ends diving into a sea of neon that becomes a logo before cutting to black.",
  "vfx_focus": [
    "Procedural rail generation",
    "Dynamic environment transformation (Geometry nodes style)",
    "Extremely high-speed camera motion with light streaks"
  ]
}
\`\`\`

**使いどころ:** VFXの多いプロンプト、POV表現、モデルに特定の技術的効果を集中させたい場合。\`vfx_focus\` 配列は強調レイヤーとして機能します。モデルに優先してほしい効果を2〜4個だけ書きます。

### 16.2 \`<<<Image1>>>\` 構文 — \`@Image1\` の代替

Seedance 2.0では、どちらの構文も使えます。\`<<<Image1>>>\` 形式は日本語圏のコミュニティプロンプトでよく見られ、とくにモーフィングや変身テンプレートのように、長いプロンプト内で参照マーカーを視覚的に目立たせたい場合によく使われます。

\`\`\`
Start from <<<Image1>>>.
The footage transforms in order: <<<Image1>>> -> <<<Image2>>> -> <<<Image3>>>...
\`\`\`

読みやすい方を使えばOKです。ただし、1つの生成内で \`@Image1\` と \`<<<Image1>>>\` を混在させないでください。

### 16.3 複数チャプターの長尺構造

**Section 15の延長チェーンとは別物です。** 複数チャプター構造では、1つのマスタースクリプト内に \`Chapter 1 / Chapter 2 / Chapter 3\` のブロックを書きます。各チャプターは**独立した15秒クリップ**として生成されます。チャプター間で連続性の言葉は共有しますが、必ずしもSeedanceの動画延長パイプラインで作る必要はありません。全体45秒の物語を先に設計し、それぞれを共有キャラ・スタイルアンカーで個別生成し、後で編集でつなぐ方法です。

\`\`\`
Chapter 1 (0–15 seconds): [Title]. Style: [...]. Camera: [...]. 
Sound effects: [...]. [Visual reference / character description]. 
[Timeline per second: 0–4s / 4–9s / 9–15s].

Chapter 2 (0–15 seconds): [Title]. Continuing from Video 1 and 
extending by 15 seconds. [Same structure].

Chapter 3 (0–15 seconds): [Title]. [Same structure].
\`\`\`

**延長チェーンとどちらを使うか:** 物語全体を最初から設計しているなら複数チャプター方式が向いています。前のクリップの動きの軌跡を文字通り継続させながら、作りながら物語を発見したい場合はSection 15の延長チェーンを使います。

### 16.4 8つのプロンプトカテゴリ

このリポジトリでは164件のプロンプトを次のカテゴリに分類しています。作品を企画するときの思考整理に便利です。

| Bucket | 扱う内容 |
|--------|----------|
| **Action / Fantasy** | 戦闘、チェイス、アニメ、武侠、クリーチャー、大規模スペクタクル |
| **Cinematic Realism** | 地に足のついた実写感、ムード、身体言語、実用的な光、 believable camera |
| **POV / FPV** | 一人称、ドローン風、ボディマウント、慣性のある移動 |
| **Commercial / Product** | 広告、ファッション、ライフスタイル、商品、プレミアムブランド |
| **Reference-Driven** | 画像参照、キャラクター一貫性、フレーム間制御 |
| **Surreal / VFX** | 抽象、非現実、スタイライズ、変形・変身重視 |
| **Templates & Structured Formats** | 再利用可能な骨組み、JSON仕様、高度に構造化された形式 |
| **General Cinematic** | より細かい分類に入らない汎用シネマティック表現 |

**Drift Protocol向け:** 主にCinematic Realism + Reference-Drivenを使い、ハック可視化の場面でだけSurreal/VFXを選択的に混ぜると良いです。

### 16.5 ハードカット・テストパターン

Seedanceのカット処理や、激しいカット下でのアイデンティティ一貫性を検証するための特殊形式です。

\`\`\`
Anime high-speed cut test — 20 hard cuts in 10 seconds 
(0.5 seconds per cut, no fade-in/fade-out, no transitions).

[0.0s–0.5s]: Cut 1 — Close-up. Character A: [description]. [action].
[0.5s–1.0s]: Cut 2 — Wide shot. Character B: [description]. [action].
[1.0s–1.5s]: Cut 3 — ...
\`\`\`

**重要な制約文:** \`"no fade-in/fade-out, no transitions"\` です。これによりハードカットを強制しやすくなります。MV風の高速カットや、キャラクター記述が激しいカット頻度に耐えられるかをテストするのに有効です。

### 16.6 サブ秒タイムコードによるマイクロタイミング

コミュニティプロンプトでは、\`0.3s\`、\`0.5s\`、\`1.5s\`、\`0.4 seconds\` のような小数秒マーカーが使われます。1秒単位では粗すぎる場合に有効です。とくによく使われるのは次の場面です。

- 感情ビート: \`"shyly lowers her head for 0.3 seconds, gently biting her lower lip"\`
- リアクションショット: \`"he is stunned for 0.4 seconds"\`
- ハードカット列: \`[0.0s–0.5s]\`, \`[1.5s–3.0s]\`
- 間やホールド: \`"natural short pauses between 200–400 milliseconds"\`

**目安:** 1秒未満のビートで、かつタイミング精度がショットの意味を変える場合だけ使います。細かく分けすぎるとノイズになります。

### 16.7 7枚画像モーフィングテンプレート（再利用用スケルトン）

N枚の静止画を1本の連続モーフィングショットに変換するための再利用テンプレートです。ポイントは、カメラ挙動の**許可リスト／禁止リスト**を明示することです。Seedanceは、このような負の制約空間に比較的よく反応します。

\`\`\`
[Basic Settings]
structure: Single continuous shot (no cuts)
progression: Morphing N images sequentially
visibility: Each image clearly recognizable for an instant (no stopping)
transition: Always smooth and continuous
style: Cinematic, high-definition, dynamic, no flicker

[Prompt Body]
Start from <<<Image1>>>.
Seamless single shot, transforming in order: 
<<<Image1>>> -> <<<Image2>>> -> ... -> <<<ImageN>>>.
Camera is constantly moving. Subject recognizability maintained.
Each image has a peak state where it is clearly visible for an instant,
but no stopping or holding.

[Transformation Logic — fixed order, no duplication]
<<<Image1>>> -> <<<Image2>>>: Push-in forward. Outline -> parts -> color 
  -> texture. Particle decomposition -> reconstruction.
<<<Image2>>> -> <<<Image3>>>: Horizontal tracking. Light scanning rewrite. 
  *Particle expression prohibited.*
<<<Image3>>> -> <<<Image4>>>: Orbit movement. Spatial distortion + lens warp.
[continue per pair...]

[Camera Behavior]
Allowed:
  - Push-in / Pull-out
  - Horizontal tracking
  - Orbit (circling)
  - Light perspective change
Prohibited:
  - Sudden blur
  - Loss of subject
  - Unnatural jumps

[Constraints]
- Cut editing prohibited (complete single shot)
- Reuse of the same effect prohibited
- Flicker, noise, breakdown prohibited
- Each image must achieve a clearly visible state at least once

[Enhancement Keywords]
dynamic camera movement, cinematic motion flow, smooth continuous morphing,
temporal coherence, high detail preservation, consistent subject identity,
seamless transformation flow
\`\`\`

**なぜ許可／禁止リストが効くのか:** 望むことを書いて、望まない挙動をモデルが避けてくれることを期待するより、行動空間そのものを制限できるからです。モーフィング以外でも、失敗パターンが予測できるプロンプトでは \`Prohibited:\` ブロックが役立ちます。

### 16.8 プロダクションデザイン言語のアンカー

高評価のコミュニティプロンプトでは、\`cinematic\` や \`high quality\` のような一般語ではなく、非常に具体的なスタイルアンカーがよく使われています。以下の表現は注目プロンプトで繰り返し見られ、結果が強くなりやすいものです。

| Anchor | 何を引き起こしやすいか | 使いどころ |
|--------|------------------------|------------|
| **Naturalistic Film Print Emulation** | 実写フィルムの特性、有機的な粒状感、正確なカラーサイエンス | 地に足のついたリアリズム、ドキュメンタリー、神話的だがリアルな表現 |
| **DaVinci industrial-grade color grading** | 精密なコントラスト制御、プロのカラーサイエンス、制御された彩度 | 商業映像、プレミアム商品、高コントラスト表現 |
| **Tsui Hark style / Tsui Hark new style Wuxia blockbuster** | 明るいトーン、“Cold Jade Blue-Black + Amber Flowing Light”、高コントラスト、山霧のソフトフィルター | 武侠、大規模アクション、アジア映画的スペクタクル |
| **Hollywood IMAX blockbuster quality** | 大判映画感、広いダイナミックレンジ、壮大なスケール | SF、アクションセットピース、Drift Protocolのハック演出 |
| **35mm handheld film camera, natural grain, subtle organic shake** | ドキュメンタリー的リアリズム、呼吸するカメラ、デジタル臭さの軽減 | Drift Protocolの目撃者／インタビュー風ビート |
| **100% real-life shooting texture** | CGIっぽさを抑え、実写映像感を高める | “本当に撮った映像” に見せたいもの全般 |
| **Cold documentary style, natural light on a cloudy day** | 彩度低め、均質な光、ドラマチックすぎない影 | トゥルークライム、調査もの、Drift Protocolのオープニング |
| **8K cinematic, ultra-fine detail, HDR glow, no artifacts** | 品質上限の強制 | 最終フレーム、ヒーローショット |

**Drift Protocolとの関連:** desaturated teal-blue / amber のGibney-Fincher風パレットに寄せるなら、\`35mm handheld film camera, natural grain, subtle organic shake + DaVinci industrial-grade color grading + cold documentary style, natural light + Naturalistic Film Print Emulation\` の組み合わせが効きやすいです。1つのプロンプトに全部を詰め込まず、2〜3個だけ重ねます。

**8つのアンカーに共通する傾向:** 形容詞で見た目を説明するのではなく、フィルムストック、カラーグレーディングツール、監督、フォーマットなど、**具体的な伝統や技術体系**を名指ししています。Seedanceはこれらの参照点を強く学習しているようです。迷ったら、汎用的なスタイル語を、あなたが知っている最も具体的な業界標準表現に置き換えます。

---

*Section 16は、EvoLinkAI/awesome-seedance-2.0-prompts（2026年4月7日付の最新エントリを含む164件のプロンプト）に基づき、8カテゴリの注目プロンプトから抽出したパターンです。*

---

*ガイド原文は2026年4月に編集。出典: EvoLinkAI/awesome-seedance-2-guide（GitHub）、Seedance2API blog、APIYI official prompt interpretation、WeShop AI guide、ImagineArt prompt collection、SeaArt community guide、Opus.pro extension & editing guide、WaveSpeedAI complete guide、Dreamina/CapCut official tutorial、Digen.ai quick guide、seedancetwo.com official user manual（Feishu doc mirror）、Volcengine Seedance公式ドキュメント、EvoLinkAI/awesome-seedance-2.0-prompts community repository（2026年4月11日収集の164件のプロンプト）。*
`
