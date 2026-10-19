import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useChat } from '@ai-sdk/react'
import { AgentChat } from './AgentChat.tsx'
import { fetchAgentMessages } from '../../lib/agentApi.ts'

const chatMocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  stop: vi.fn(),
  setMessages: vi.fn(),
}))

vi.mock('../../lib/agentApi.ts', () => ({
  agentChatUrl: () => '/api/agent/chat',
  fetchAgentMessages: vi.fn().mockResolvedValue([]),
}))

vi.mock('ai', () => ({
  DefaultChatTransport: class {
    constructor(_opts: unknown) {}
  },
}))

vi.mock('@ai-sdk/react', () => ({
  useChat: vi.fn(() => ({
    id: 'conv-1',
    messages: [],
    status: 'ready',
    sendMessage: chatMocks.sendMessage,
    stop: chatMocks.stop,
    error: undefined,
    setMessages: chatMocks.setMessages,
  })),
}))

function renderChat({
  isDraft = true,
  onFirstSent,
}: { isDraft?: boolean; onFirstSent?: (text: string) => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AgentChat
        conversationId="conv-1"
        provider="xai"
        model="grok-4"
        isDraft={isDraft}
        onFirstSent={onFirstSent}
      />
    </QueryClientProvider>,
  )
}

function typeAndSubmit(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'エージェントへのメッセージ' }), {
    target: { value: text },
  })
  fireEvent.click(screen.getByRole('button', { name: '送信' }))
}

describe('AgentChat', () => {
  beforeEach(() => {
    chatMocks.sendMessage.mockReset()
    chatMocks.stop.mockReset()
    chatMocks.setMessages.mockReset()
    vi.mocked(useChat).mockReset()
    vi.mocked(useChat).mockImplementation(
      () =>
        ({
          id: 'conv-1',
          messages: [],
          status: 'ready',
          sendMessage: chatMocks.sendMessage,
          stop: chatMocks.stop,
          error: undefined,
          setMessages: chatMocks.setMessages,
        }) as never,
    )
    vi.mocked(fetchAgentMessages).mockReset()
    vi.mocked(fetchAgentMessages).mockResolvedValue([])
  })

  afterEach(cleanup)

  it('draft 中は会話履歴を取得しない', async () => {
    renderChat()
    await screen.findByRole('textbox', { name: 'エージェントへのメッセージ' })
    expect(fetchAgentMessages).not.toHaveBeenCalled()
  })

  it('既存会話ではマウント時にメッセージを読み込む', async () => {
    renderChat({ isDraft: false })
    await waitFor(() => expect(fetchAgentMessages).toHaveBeenCalledWith('conv-1'))
  })

  it('既存会話の読み込み失敗を表示する', async () => {
    vi.mocked(fetchAgentMessages).mockRejectedValue(new Error('Request failed (500)'))
    renderChat({ isDraft: false })
    expect(await screen.findByRole('alert')).toHaveTextContent('会話を読み込めませんでした')
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument()
  })

  it('初回送信は sendMessage し、成功後に永続化コールバックを呼ぶ', async () => {
    chatMocks.sendMessage.mockResolvedValue(undefined)
    const onFirstSent = vi.fn()
    renderChat({ onFirstSent })
    typeAndSubmit('夕焼けの海の画像を作って')
    await waitFor(() =>
      expect(chatMocks.sendMessage).toHaveBeenCalledWith({ text: '夕焼けの海の画像を作って' }),
    )
    await waitFor(() => expect(onFirstSent).toHaveBeenCalledWith('夕焼けの海の画像を作って'))
  })

  it('初回送信が失敗したら入力を復元し、永続化コールバックを呼ばない', async () => {
    chatMocks.sendMessage.mockRejectedValue(new Error('API キーがありません'))
    const onFirstSent = vi.fn()
    renderChat({ onFirstSent })
    typeAndSubmit('失敗するメッセージ')
    await screen.findByText('送信に失敗しました: API キーがありません')
    expect(onFirstSent).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'エージェントへのメッセージ' })).toHaveValue(
      '失敗するメッセージ',
    )
  })

  it('2 通目以降も sendMessage を使う', async () => {
    chatMocks.sendMessage.mockResolvedValue(undefined)
    renderChat({ isDraft: false })
    await screen.findByRole('textbox', { name: 'エージェントへのメッセージ' })
    typeAndSubmit('続きのメッセージ')
    await waitFor(() => expect(chatMocks.sendMessage).toHaveBeenCalledWith({ text: '続きのメッセージ' }))
  })

  it('error 状態では警告を表示し、送信欄をブロックしない', async () => {
    vi.mocked(useChat).mockImplementation(
      () =>
        ({
          id: 'conv-1',
          messages: [],
          status: 'error',
          sendMessage: chatMocks.sendMessage,
          stop: chatMocks.stop,
          error: new Error('接続できません'),
          setMessages: chatMocks.setMessages,
        }) as never,
    )
    renderChat({ isDraft: false })
    expect(await screen.findByText('接続できません')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '送信' })).toBeInTheDocument()
  })
})
