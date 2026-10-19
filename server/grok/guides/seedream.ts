// Seedream 4.x / 5.x の公式寄りのレイヤー順と引用テキスト規則。
// BytePlus ModelArk「Seedream 4.0-4.5 prompt guide」は JS ページのため、
// 同系の公開プロンプト構造（被写体先頭、引用テキスト、編集の維持）で要約する。
// 取得元:
// - https://docs.byteplus.com/en/docs/ModelArk/1829186
// - https://runware.ai/docs/models/bytedance-seedream-4-5/guides/prompting

export const SEEDREAM_GUIDE_FILE_NAME = 'Seedream_Official_Prompt_Guide_JA.md'

export const SEEDREAM_GUIDE_CONTENT = `# Seedream プロンプト最適化ガイド

Seedream 4.0 / 4.5 / 5.x は先頭の句を最も重く読む。被写体を先に置き、短い探索と層状の本番文を使い分ける。

## 最優先原則

1. 被写体と定義属性を第一文に置く。スタイル前置きから始めない。
2. 画面内文字は \`"DOUBLE QUOTES"\` で原文のまま。
3. 編集は「何を変えるか」+「何を残すか」。
4. 複数参照は \`@imageN\` を維持し、役割を1つずつ。無い番号を捏造しない。
5. 比率・解像度は創作本文へ混ぜない。
6. 完成プロンプト本文のみ。

## 生成

短文（探索、おおよそ10語以下）か、層状（本番）:

\`\`\`text
Subject + Action + Environment + Style + Lighting + Composition + Output purpose
\`\`\`

層状のときは配置・光・読み取れる文字・材質を具体化する。4.5 以降は小さい文字と多要素の保持が強い。目安 30〜100語、上限意識は約2000字。

## 編集 / 参照

\`\`\`text
Edit target + requested change + desired result + what must remain unchanged
\`\`\`

参照: どの画像が外見 / 構図 / スタイル / 製品かを明示する。レイヤー分解は「どの層を出すか」だけを書き、無関係な再構図をしない。
`
