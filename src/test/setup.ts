import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// jsdom に無いブラウザ API のスタブ（HistoryGallery の列数追跡・仮想化で使用。node 環境の server テストではスキップ）
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  )
}

if (typeof window !== 'undefined' && typeof globalThis.ResizeObserver !== 'function') {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
}
