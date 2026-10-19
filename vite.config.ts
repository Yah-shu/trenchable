import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { englishOverlay } from './i18n/vite-plugin.mjs'

const pkg = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./package.json', import.meta.url)),
    'utf8',
  ),
) as { version: string }

const ROOT = fileURLToPath(new URL('.', import.meta.url))

// data/ (history DB + WAL, media, the encrypted key) is served by the API, never as Vite static files.
// Vite's default fs.deny list (setting deny replaces it), plus that folder.
const DATA_DIR = fileURLToPath(new URL('./data/', import.meta.url)).replaceAll('\\', '/')
const FS_DENY = ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', `${DATA_DIR}**`, 'extras/**/venv/**', 'extras/**/models/**']

export default defineConfig(({ mode }) => {
  // Ports: WEB_PORT (default 5173) for this page, PORT (default 8787) for the API server. Set both in `.env`
  // to run beside something else that already uses them.
  const env = loadEnv(mode, ROOT, '')
  const web = Number(env.WEB_PORT || 5173)
  const api = `http://127.0.0.1:${Number(env.PORT || 8787)}`
  return {
    base: '/',
    plugins: [englishOverlay(), react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    },
    // Two pages: the studio (index.html) and the full per-model form it frames as Advanced (advanced.html).
    build: {
      rollupOptions: {
        input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), advanced: fileURLToPath(new URL('./advanced.html', import.meta.url)) },
      },
    },
    server: {
      port: web,
      strictPort: true,
      // Opens the app in the browser on start; OPEN_BROWSER=0 turns that off.
      open: env.OPEN_BROWSER === '0' ? false : '/',
      fs: { deny: FS_DENY },
      proxy: {
        '/api': { target: api, changeOrigin: true, timeout: 0, proxyTimeout: 0 },
        '/media': { target: api, changeOrigin: true },
      },
    },
  }
})
