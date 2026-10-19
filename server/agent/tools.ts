import { tool } from 'ai'
import { z } from 'zod'
import type { MediaTaskData } from './mediaTask.ts'
import { errorMessage, StudioAgentError } from './errors.ts'
import * as actions from './actions.ts'

export interface StudioToolHooks {
  onMediaTask?: (data: MediaTaskData) => void
}

export function createStudioTools(hooks: StudioToolHooks = {}) {
  return {
    'list-workflows': tool({
      description:
        '生成可能な画像/動画/音声ワークフロー(モデル)の一覧を取得する。category (image/video/audio) や capability (例: lip-sync, upscale, tts) で絞り込める。生成前に必ずこれで候補を確認すること。',
      inputSchema: z.object({
        category: z.enum(['image', 'video', 'audio']).optional(),
        capability: z.string().optional(),
        q: z.string().optional(),
      }),
      execute: async (data) => {
        return actions.listWorkflows(data)
      },
    }),
    'get-workflow-schema': tool({
      description:
        'ワークフローの入力スキーマ(必須/任意パラメータ、型、選択肢、デフォルト)を取得する。generate-media の前に必ず呼び、パラメータを推測で埋めないこと。',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        try {
          const schema = await actions.getWorkflowSchema(id)
          return {
            id: schema.id,
            model: schema.model,
            title: schema.title,
            category: schema.category,
            provider: schema.provider,
            operation: schema.operation ?? 'generate',
            useCase: schema.useCase ?? null,
            docsUrl: schema.docsUrl ?? null,
            fields: schema.fields.map((f) => ({
              name: f.name,
              type: f.type,
              label: f.label,
              required: f.required === true,
              ...(f.default !== undefined ? { default: f.default } : {}),
              ...(f.enum ? { enum: f.enum } : {}),
              ...(f.description ? { description: f.description } : {}),
              ...(f.accept ? { accept: f.accept } : {}),
              ...(f.maxLength ? { maxLength: f.maxLength } : {}),
              ...(f.min !== undefined ? { min: f.min } : {}),
              ...(f.max !== undefined ? { max: f.max } : {}),
            })),
          }
        } catch (error) {
          return `ワークフローが見つかりません: ${errorMessage(error)}`
        }
      },
    }),
    'generate-media': tool({
      description:
        '画像/動画/音声の生成タスクを作成する。必須: workflowId と input。実行前にユーザーへモデル・主要パラメータ・クレジット消費の見通しを提示して確認を取ること。戻り値の taskId / provider / operation を get-task-status に渡す(生成は非同期)。',
      inputSchema: z.object({
        workflowId: z.string(),
        input: z.record(z.string(), z.unknown()),
        title: z.string().optional(),
      }),
      execute: async (data) => {
        try {
          const created = await actions.generateMedia({
            workflowId: data.workflowId,
            params: data.input,
            title: data.title,
          })
          hooks.onMediaTask?.({
            taskId: created.taskId,
            title: data.title ?? created.schema.title,
            workflowId: created.schema.id,
            status: 'submitted',
          })
          return {
            taskId: created.taskId,
            workflow: created.workflow,
            provider: created.schema.provider,
            operation: created.schema.operation ?? 'generate',
            note: created.note,
          }
        } catch (error) {
          return `生成の開始に失敗しました: ${errorMessage(error)}`
        }
      },
    }),
    'get-task-status': tool({
      description:
        '生成タスクの状態を確認する。成功時は結果メディアの URL を返す。provider/operation は generate-media の戻り値を使う。省略時は履歴から補う。',
      inputSchema: z.object({
        taskId: z.string(),
        provider: z.string().optional(),
        operation: z.string().optional(),
      }),
      execute: async (data) => {
        try {
          const task = await actions.getTaskStatus(data)
          if (task.state === 'success' || task.state === 'partial') {
            hooks.onMediaTask?.({
              taskId: task.taskId,
              status: 'succeeded',
              resultUrls: task.resultUrls,
              media: task.media.map((m) => ({
                kind: m.kind,
                ...(m.url ? { url: m.url } : {}),
                ...(m.localPath ? { localPath: m.localPath } : {}),
              })),
            })
          } else if (task.state === 'fail') {
            hooks.onMediaTask?.({
              taskId: task.taskId,
              status: 'failed',
              error: task.failMsg ?? '不明なエラー',
            })
          }
          return {
            taskId: task.taskId,
            state: task.state,
            provider: task.provider,
            operation: task.operation,
            resultUrls: task.resultUrls,
            ...(task.failMsg ? { failMsg: task.failMsg } : {}),
            ...(task.creditsConsumed !== undefined
              ? { creditsConsumed: task.creditsConsumed }
              : {}),
          }
        } catch (error) {
          return `状態の確認に失敗しました: ${errorMessage(error)}`
        }
      },
    }),
    'search-history': tool({
      description: '過去の生成履歴を検索する。タスク ID、モデル名、プロンプト内容で探せる。',
      inputSchema: z.object({
        q: z.string().optional(),
        category: z.enum(['image', 'video', 'audio']).optional(),
        limit: z.number().optional(),
      }),
      execute: async (data) => actions.searchHistory(data),
    }),
    'get-task-input': tool({
      description:
        '過去タスクの入力パラメータを取得する。延長・再生成・パラメータ変更での再実行のベースにする。',
      inputSchema: z.object({ taskId: z.string() }),
      execute: async ({ taskId }) => {
        try {
          return actions.getTaskInput(taskId)
        } catch (error) {
          return `タスクが見つかりません: ${errorMessage(error)}`
        }
      },
    }),
    'get-credit-balance': tool({
      description: 'kie.ai のクレジット残高を確認する。高コストな生成の前に確認するとよい。',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          return await actions.readCreditBalance()
        } catch (error) {
          return `残高の確認に失敗しました: ${errorMessage(error)}`
        }
      },
    }),
    'optimize-prompt': tool({
      description:
        'プロンプトを対象モデル向けに最適化する(Grok CLI 使用)。ユーザーの意図を聞いた上で、生成前のブラッシュアップとして提案する。',
      inputSchema: z.object({
        prompt: z.string(),
        modelId: z.string().optional(),
      }),
      execute: async (data) => {
        try {
          return await actions.optimizePrompt(data)
        } catch (error) {
          if (error instanceof StudioAgentError && error.status === 503) {
            return error.message
          }
          return `プロンプト最適化に失敗しました: ${errorMessage(error)}`
        }
      },
    }),
  }
}
