// Qwen-Image / QwenCloud 公式の画像プロンプト公式。
// 取得元:
// - https://docs.qwencloud.com/developer-guides/accuracy-tuning/image-generation

export const QWEN_GUIDE_FILE_NAME = 'Qwen_Image_Official_Prompt_Guide_JA.md'

export const QWEN_GUIDE_CONTENT = `# Qwen Image プロンプト最適化ガイド

Qwen-Image は中英の具体描写と画面内文字が強い。編集は変更点を命令形で。

## 最優先原則

1. 探索は \`Subject + Setting + Style\`。本番は Camera / Atmosphere / Detail を足す。
2. 被写体の外見と動作を先に。
3. 画面内文字は引用符で原文（漢字・かなを含む）のまま。
4. 編集は「何を変える / 何を残す」。参照番号を捏造しない。
5. ネガティブは本文に長く混ぜず、除外は短い avoid 句かユーザーの negative 欄前提。
6. 完成プロンプト本文のみ。

## 本番チェックリスト

Subject, Action/Pose, Style, Setting, Lighting, Atmosphere, Camera angle, Shot size, Lens。関係ある項だけ使う。

画角例: extreme close-up / close-up / medium shot / long shot。視点: eye level / low angle / bird's eye。レンズ: macro / telephoto / fisheye。

東アジアの画風（ink painting, Gongbi, Chinese ink）はスタイル語を1系統に揃える。
`
