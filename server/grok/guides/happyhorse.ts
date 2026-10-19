// HappyHorse / HappyHorse 1.1 の KIE・公開 API ドキュメント。
// 取得元:
// - https://docs.kie.ai/market/happyhorse/text-to-video
// - https://kie.ai/happyhorse-1-1
// - https://help.scenario.com/articles/4185158276-happy-horse-1-1-the-essentials

export const HAPPYHORSE_GUIDE_FILE_NAME = 'HappyHorse_Official_Prompt_Guide_JA.md'

export const HAPPYHORSE_GUIDE_CONTENT = `# HappyHorse プロンプト最適化ガイド

HappyHorse は画・カメラ・台詞・ネイティブ音を1本の本文に書く。参照は **\`[Image N]\`**（\`@image\` にしない）。

## 最優先原則

1. \`[Image 1]\` / \`[Image 2]\` の番号は media 配列順。対象を「[Image 1] の赤い旗袍の女性」のように明示する。
2. R2V では \`character1\` … を参照順に使う（最大9）。ラベルを途中で変えない。
3. 非中文 約5000字 / 中文 約2500字。埋め草で上限を使い切らない。
4. 台詞があるクリップは 11〜15秒側が余裕。短い尺に長台詞を詰めない。
5. 尺・解像度は本文へ混ぜない。
6. 完成プロンプト本文のみ。

## 本文

\`\`\`text
Subject + action + scene + camera + dialogue + native audio / lip-sync
\`\`\`

I2V は first frame を動かして聞こえる変化だけ書く。T2V はシーン全体を具体化する。video-edit は変更範囲と維持範囲を分ける。
`
