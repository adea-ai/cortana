import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

import { defineConfig, searchForWorkspaceRoot } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// The shared library owns font choices. Bun resolves its assets outside the
// checkout, so development serves only those dependency directories.
const sharedRequire = createRequire(import.meta.resolve('@adea-ai/ui/package.json'))
const fontPackagePaths = [
  '@fontsource-variable/space-grotesk',
  '@fontsource-variable/jetbrains-mono',
  '@fontsource-variable/geist',
  '@fontsource-variable/geist-mono',
].map((name) => realpathSync(dirname(sharedRequire.resolve(`${name}/package.json`))))

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
      allow: [searchForWorkspaceRoot(process.cwd()), ...fontPackagePaths],
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
