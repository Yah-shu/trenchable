import { useActionState, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Database,
  FolderOpen,
  KeyRound,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { clearApiKey, checkForUpdate, fetchHealth, fetchSettings, openMediaFolder, saveApiKey, syncModels } from '../lib/api.ts'
import type { QueryClient } from '@tanstack/react-query'
import { Pressable } from './motion/Pressable.tsx'
import { LlmSettingsSection } from './LlmSettingsSection.tsx'
import { SpringSheet } from './motion/SpringSheet.tsx'

const APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev'

interface SaveKeyState {
  error: string | null
  saved: boolean
}

/**
 * API キー保存フォーム。useActionState で pending / error を宣言的に管理する。
 * シートを開くたびに key で再マウントされ、入力と結果表示がリセットされる。
 */
function ApiKeyForm({
  hasApiKey,
  onSaved,
}: {
  hasApiKey: boolean
  onSaved: () => Promise<void>
}) {
  const [apiKey, setApiKey] = useState('')
  const [state, formAction, isPending] = useActionState<SaveKeyState, FormData>(
    async (_prev, formData) => {
      const key = String(formData.get('api-key') ?? '').trim()
      if (!key) return { error: null, saved: false }
      try {
        await saveApiKey(key)
        setApiKey('')
        await onSaved()
        return { error: null, saved: true }
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : 'キーの保存に失敗しました',
          saved: false,
        }
      }
    },
    { error: null, saved: false },
  )

  const trimmed = apiKey.trim()
  const canSave = trimmed.length > 0 && !isPending
  const showSaved = state.saved && trimmed.length === 0

  return (
    <form action={formAction}>
      <div className="mt-3 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <KeyRound
            size={14}
            strokeWidth={2}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <input
            id="settings-api-key"
            name="api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            data-sheet-initial-focus="true"
            className="studio-input w-full py-2 pr-3 pl-9"
            placeholder={hasApiKey ? '新しいキーで上書き…' : 'sk-... を貼り付け'}
            value={apiKey}
            disabled={isPending}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </div>
        <Pressable
          type="submit"
          disabled={!canSave}
          className="studio-btn-primary w-auto shrink-0 gap-1 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          scaleTo={0.96}
          aria-busy={isPending || undefined}
        >
          {showSaved ? (
            <>
              <Check size={14} strokeWidth={2} aria-hidden />
              保存済み
            </>
          ) : isPending ? (
            '保存中…'
          ) : (
            '保存'
          )}
        </Pressable>
      </div>
      {state.error && (
        <p className="studio-field-error mt-2" role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}

/**
 * アップデート確認ボタン。デスクトップ版の Updater API を叩き、
 * 確認中 → 結果（最新 / 新バージョンDL済み / エラー）を表示する。
 */
function UpdateCheckButton() {
  const [status, setStatus] = useState<
    'idle' | 'checking' | 'up-to-date' | 'downloaded' | 'error'
  >('idle')
  const [detail, setDetail] = useState<string | null>(null)

  async function handleCheck() {
    setStatus('checking')
    setDetail(null)
    try {
      const { data } = await checkForUpdate()
      if (data.available && data.downloaded) {
        setStatus('downloaded')
        setDetail(data.version ? `v${data.version}` : null)
      } else {
        setStatus('up-to-date')
      }
    } catch (err) {
      setStatus('error')
      setDetail(
        err instanceof Error ? err.message : '確認に失敗しました',
      )
    }
  }

  const checking = status === 'checking'

  return (
    <div className="flex flex-col items-end gap-1">
      <Pressable
        onClick={() => void handleCheck()}
        disabled={checking}
        className="studio-btn w-auto gap-1 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        scaleTo={0.96}
        aria-busy={checking || undefined}
      >
        <RefreshCw
          size={13}
          strokeWidth={2}
          aria-hidden
          className={checking ? 'animate-spin' : undefined}
        />
        {checking ? '確認中…' : 'アップデートを確認'}
      </Pressable>
      {status === 'up-to-date' && (
        <p className="text-xs text-[var(--text-muted)]" role="status">
          最新のバージョンです
        </p>
      )}
      {status === 'downloaded' && (
        <p className="text-xs text-[var(--success,var(--accent))]" role="status">
          {detail ?? '新しいバージョン'} をダウンロード済み — 次回起動時に適用
        </p>
      )}
      {status === 'error' && (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {detail}
        </p>
      )}
    </div>
  )
}

/**
 * モデルカタログ手動同期ボタン。force sync を実行し、成功時に models クエリを失効する。
 */
function SyncModelsButton({ queryClient }: { queryClient: QueryClient }) {
  const mutation = useMutation({
    mutationFn: () => syncModels(),
    onSuccess: (data) => {
      if (data.data.synced) {
        queryClient.invalidateQueries({ queryKey: ['models'] })
      }
    },
  })

  const syncing = mutation.isPending
  const synced = mutation.isSuccess && mutation.data.data.synced
  const skipped = mutation.isSuccess && !mutation.data.data.synced
  const error = mutation.isError
    ? mutation.error instanceof Error
      ? mutation.error.message
      : '同期に失敗しました'
    : null

  return (
    <div className="flex flex-col items-end gap-1">
      <Pressable
        onClick={() => mutation.mutate()}
        disabled={syncing}
        className="studio-btn w-auto gap-1 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        scaleTo={0.96}
        aria-busy={syncing || undefined}
      >
        <Database
          size={13}
          strokeWidth={2}
          aria-hidden
          className={syncing ? 'animate-spin' : undefined}
        />
        {syncing ? '同期中…' : 'モデルを更新'}
      </Pressable>
      {synced && (
        <p className="text-xs text-[var(--success,var(--accent))]" role="status">
          {mutation.data.data.modelCount ?? 0} モデルを更新しました
        </p>
      )}
      {skipped && (
        <p className="text-xs text-[var(--text-muted)]" role="status">
          {mutation.data.data.reason ?? 'スキップされました'}
        </p>
      )}
      {error && (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await fetchSettings()).data,
    enabled: open,
    staleTime: 30_000,
  })

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    enabled: open,
    staleTime: 60_000,
  })

  async function refreshDependentQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['settings'] }),
      queryClient.invalidateQueries({ queryKey: ['health'] }),
      queryClient.invalidateQueries({ queryKey: ['credits'] }),
    ])
  }

  const remove = useMutation({
    mutationFn: () => clearApiKey(),
    onSuccess: async () => {
      await refreshDependentQueries()
    },
  })

  const settings = settingsQuery.data
  const removeError =
    remove.error instanceof Error ? remove.error.message : null

  return (
    <SpringSheet
      open={open}
      onClose={onClose}
      labelledBy="settings-title"
      maxWidthClass="max-w-lg"
    >
      <div className="overflow-y-auto px-5 pt-4 pb-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)]/10 text-[var(--accent)]">
            <Settings size={20} strokeWidth={2} aria-hidden />
          </span>
          <div>
            <h2 id="settings-title" className="text-lg font-bold">
              設定
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
              KIE API キーを保存すると、以降の生成に使用されます。キーはこの端末内（アプリのデータ領域）にのみ保存されます。
            </p>
          </div>
        </div>

        <section className="mt-5">
          <label htmlFor="settings-api-key" className="studio-label">
            KIE API キー
          </label>

          {settingsQuery.isLoading ? (
            <div
              className="studio-skeleton mt-2 h-10 w-full rounded-[var(--radius-md)]"
              role="status"
              aria-label="設定を読み込んでいます"
            />
          ) : (
            <>
              {settings?.hasApiKey ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--success,var(--accent))]/25 bg-[var(--accent)]/8 px-3 py-2 text-xs">
                  <ShieldCheck
                    size={14}
                    strokeWidth={2}
                    aria-hidden
                    className="text-[var(--accent)]"
                  />
                  <span className="font-medium text-[var(--text)]">
                    保存済み
                  </span>
                  {settings.apiKeyMasked && (
                    <span className="font-mono tabular-nums text-[var(--text-muted)]">
                      {settings.apiKeyMasked}
                    </span>
                  )}
                  {!settings.apiKeyFromStore && (
                    <span className="text-[var(--text-muted)]">
                      （環境変数から）
                    </span>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-[var(--warning)]">
                  未設定です。キーを保存すると生成できるようになります。
                </p>
              )}

              <ApiKeyForm
                key={String(open)}
                hasApiKey={Boolean(settings?.hasApiKey)}
                onSaved={refreshDependentQueries}
              />

              {settings?.hasApiKey && settings.apiKeyFromStore && (
                <Pressable
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                  className="studio-btn mt-2 w-auto gap-1 px-3 text-xs text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-50"
                  scaleTo={0.96}
                >
                  <Trash2 size={13} strokeWidth={2} aria-hidden />
                  {remove.isPending ? '削除中…' : '保存したキーを削除'}
                </Pressable>
              )}

              {removeError && (
                <p className="studio-field-error mt-2" role="alert">
                  {removeError}
                </p>
              )}
            </>
          )}
        </section>

        <LlmSettingsSection />

        <section className="mt-6 border-t border-[var(--border)] pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="studio-label">ローカルメディア</div>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                生成結果はこの端末のフォルダに自動保存されます。14日を過ぎたファイルは削除される場合があります。
              </p>
            </div>
            <Pressable
              onClick={() => void openMediaFolder()}
              className="studio-btn w-auto shrink-0 gap-1 px-3 text-xs"
              scaleTo={0.96}
            >
              <FolderOpen size={13} strokeWidth={2} aria-hidden />
              フォルダを開く
            </Pressable>
          </div>
        </section>

        <section className="mt-6 border-t border-[var(--border)] pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="studio-label">モデルカタログ</div>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                docs.kie.ai から最新モデル一覧を取得します
              </p>
            </div>
            <SyncModelsButton queryClient={queryClient} />
          </div>
        </section>

        <section className="mt-6 border-t border-[var(--border)] pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="studio-label">アプリ情報</div>
              <p className="mt-1 text-sm tabular-nums text-[var(--text)]">
                TRENCHABLE{' '}
                <span className="text-[var(--text-muted)]">v{APP_VERSION}</span>
              </p>
            </div>
            {healthQuery.data?.isDesktop && <UpdateCheckButton />}
          </div>
          {healthQuery.data?.isDesktop && (
            <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
              デスクトップ版は起動時に自動でアップデートを確認します。新しい版がある場合は次回起動時に適用されます。
            </p>
          )}
        </section>

        <div className="mt-5 flex justify-end">
          <Pressable onClick={onClose} className="studio-btn" scaleTo={0.96}>
            閉じる
          </Pressable>
        </div>
      </div>
    </SpringSheet>
  )
}
