import { defineConfig, searchForWorkspaceRoot } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { realpathSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const geistPackagePath = realpathSync(
  dirname(fileURLToPath(import.meta.resolve('@fontsource-variable/geist')))
)

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    fs: {
      // Bun links packages into its cache outside the worktree. Allow only
      // the resolved Geist package so its font files work in development
      // without broadening Vite's filesystem access to the whole cache.
      allow: [searchForWorkspaceRoot(process.cwd()), geistPackagePath],
    },
    proxy: {
      '/v1': 'http://127.0.0.1:7331',
      '/healthz': 'http://127.0.0.1:7331',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    manifest: true,
  },
})
