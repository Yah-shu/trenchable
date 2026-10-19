import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LazyMotion } from 'motion/react'
import './index.css'
import App from './App.tsx'
import { resolveApiBase } from './lib/api.ts'

const loadMotionFeatures = () =>
  import('./lib/motionFeatures.ts').then((module) => module.default)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
})

async function boot() {
  // Packaged desktop may bind 8788+ when 8787 is taken; pick the best API first.
  await resolveApiBase()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <LazyMotion features={loadMotionFeatures} strict>
          <App />
        </LazyMotion>
      </QueryClientProvider>
    </StrictMode>,
  )
}

void boot()
