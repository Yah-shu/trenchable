// Black Forest Labs 公式 FLUX.2 prompting guide。
// 取得元:
// - https://docs.bfl.ai/guides/prompting_guide_flux2
// - https://github.com/black-forest-labs/skills

export const FLUX_GUIDE_FILE_NAME = 'FLUX2_Official_Prompt_Guide_JA.md'

export const FLUX_GUIDE_CONTENT = `# FLUX.2 プロンプト最適化ガイド

公式: **ネガティブプロンプトは使わない。** 欲しいものを肯定文で書く。語順は先頭が強い。

## 最優先原則

1. \`Subject + Action + Style + Context + Lighting + Technical\`。重要要素を先に。
2. 否定（no blur / no people）を書かず、sharp focus / empty street のように言い換える。
3. 画面内文字は引用符。配置・書体・サイズを書く。ブランド色は対象に結び付けた \`#RRGGBB\`。
4. 参照があれば各画像の役割を明示する。Studio の \`@imageN\` があれば維持する。
5. 完成プロンプト本文のみ。JSON が必要ならユーザーが既に JSON を使っているときだけ。

## 長さ

- 10〜30語: 探索
- **30〜80語: 本番の目安**
- 80語超: 複雑な多要素のみ

## 写真

カメラ・レンズ・フィルムを具体名で。\`shot on Sony A7IV\` / \`Kodak Portra 400\` は \`professional photo\` より効く。

## 色

\`The car is color #FF0000\`。文末に hex を孤立させない。

## 複雑な場面

自然文で足りないときだけ JSON（scene / subjects / lighting / camera）。KIE の通常入力は自然文を優先する。
`
