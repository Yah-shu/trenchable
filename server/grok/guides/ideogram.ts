// Ideogram 公式 prompting guide（2.0 / 3.0 自然文。カタログは v3）。
// 取得元:
// - https://docs.ideogram.ai/using-ideogram/getting-started/prompting-guide/in-a-nutshell
// - https://docs.ideogram.ai/using-ideogram/getting-started/prompting-guide/2-prompting-fundamentals/text-and-typography

export const IDEOGRAM_GUIDE_FILE_NAME = 'Ideogram_Official_Prompt_Guide_JA.md'

export const IDEOGRAM_GUIDE_CONTENT = `# Ideogram プロンプト最適化ガイド

Ideogram 3.0 は自然文。重みや隠しパラメータは埋めない。見えるものだけを書く。文字は得意なので引用符を先に置く。

## 最優先原則

1. 主旨を文頭に。
2. 画面内テキストは \`"quotes"\` で原文のまま、できるだけ早く言及する。長文ほど崩れやすい。
3. 否定は使わない。\`no people\` → \`empty street\`。\`no background\` → \`plain white background\`。
4. おおよそ150語以内。超えると後半が落ちる。
5. \`@imageN\` があれば維持する（edit / remix / character）。
6. 完成プロンプト本文のみ。MagicPrompt 前提でも意図は本文で完結させる。

## 構造

\`\`\`text
[Image summary]. [Main subject], [pose/action], [secondary elements], [setting], [lighting], [framing]
\`\`\`

全部埋める必要はない。探索は短く、制御が要るときだけ層を足す。

Character / remix は「誰のどの特徴を残し、何を変えるか」を明示する。
`
