import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AgentView } from './AgentView.tsx'
import { createAgentConversation, fetchAgentConversations, fetchAgentHealth } from '../../lib/agentApi.ts'

vi.mock('../../lib/agentApi.ts', () => ({
  fetchAgentConversations: vi.fn().mockResolvedValue([]),
  fetchAgentHealth: vi.fn().mockResolvedValue({ ok: true }),
  createAgentConversation: vi.fn().mockResolvedValue({}),
  deleteAgentConversation: vi.fn().mockResolvedValue(undefined),
  renameAgentConversation: vi.fn().mockResolvedValue({}),
  newConversationId: vi.fn(() => 'draft-conv-1'),
  agentChatUrl: () => '/api/agent/chat',
  fetchAgentMessages: vi.fn().mockResolvedValue([]),
}))

vi.mock('./AgentModelPicker.tsx', () => ({
  AgentModelPicker: ({
    onChange,
  }: {
    onChange: (selection: { provider: string; model: string }) => void
  }) => (
    <button type="button" onClick={() => onChange({ provider: 'xai', model: 'grok-4' })}>
      pick-model
    </button>
  ),
}))

vi.mock('./AgentChat.tsx', () => ({
  AgentChat: ({
    isDraft,
    onFirstSent,
  }: {
    isDraft: boolean
    onFirstSent?: (text: string) => void
  }) => (
    <>
      <span>{isDraft ? 'chat-draft' : 'chat-existing'}</span>
      <button type="button" onClick={() => onFirstSent?.('夕焼けの海の画像を作って')}>
        chat-stub
      </button>
      <button type="button" onClick={() => onFirstSent?.('あ'.repeat(40))}>
        chat-stub-long
      </button>
    </>
  ),
}))

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AgentView />
    </QueryClientProvider>,
  )
}

async function openDraftChat() {
  renderView()
  const [newButton] = await screen.findAllByRole('button', { name: '新規会話' })
  fireEvent.click(newButton!)
  fireEvent.click(screen.getByText('pick-model'))
  fireEvent.click(screen.getByRole('button', { name: '会話を開始' }))
}

describe('AgentView', () => {
  afterEach(() => {
    cleanup()
    vi.mocked(fetchAgentHealth).mockResolvedValue({ ok: true })
    vi.mocked(fetchAgentConversations).mockResolvedValue([])
  })

  it('「会話を開始」は永続化せず draft のチャットを開くだけ', async () => {
    await openDraftChat()
    expect(screen.getByText('chat-draft')).toBeInTheDocument()
    expect(createAgentConversation).not.toHaveBeenCalled()
  })

  it('既存会話があっても auto-select に draft を上書きされない', async () => {
    vi.mocked(fetchAgentConversations).mockResolvedValue([
      {
        id: 'old-conv-1',
        title: '既存の会話',
        provider: 'xai',
        model: 'grok-4',
        createdAt: 1,
        updatedAt: 1,
      },
    ])
    await openDraftChat()
    expect(screen.getByText('chat-draft')).toBeInTheDocument()
    expect(screen.queryByText('chat-existing')).not.toBeInTheDocument()
    expect(createAgentConversation).not.toHaveBeenCalled()
  })

  it('初回送信で会話を永続化する（タイトルは本文先頭）', async () => {
    await openDraftChat()
    fireEvent.click(screen.getByText('chat-stub'))
    expect(createAgentConversation).toHaveBeenCalledWith({
      id: 'draft-conv-1',
      title: '夕焼けの海の画像を作って',
      provider: 'xai',
      model: 'grok-4',
    })
  })

  it('32 文字超の本文は省略してタイトルにする', async () => {
    await openDraftChat()
    fireEvent.click(screen.getByText('chat-stub-long'))
    expect(createAgentConversation).toHaveBeenCalledWith({
      id: 'draft-conv-1',
      title: `${'あ'.repeat(32)}…`,
      provider: 'xai',
      model: 'grok-4',
    })
  })

  it('API 不通時は送信前に警告する', async () => {
    vi.mocked(fetchAgentHealth).mockRejectedValue(new Error('Request failed (502)'))
    renderView()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'エージェントに接続できませんでした',
    )
  })
})
