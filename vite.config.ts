import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'
import { expectedId } from './scripts/orch-toolchain.mjs'

const root = dirname(fileURLToPath(import.meta.url))
// The executable gate is qualified on macOS/Linux. Windows keeps the original
// uncached command/environment until its native launcher path is qualified.
const cacheable = process.platform === 'darwin' || process.platform === 'linux'
const toolchain = cacheable ? expectedId(root) : ''
const prefix = cacheable ? `ORCH_TOOLCHAIN=${toolchain} env -u FORCE_COLOR ` : ''
const preflight = cacheable ? ['orch:toolchain'] : []
const input = [
  { auto: true },
  'package.json',
  'bun.lock',
  'bunfig.toml',
  'tsconfig*.json',
  'vite.config.ts',
  'scripts/**',
  'apps/web/**',
  '.oxlintrc.json',
  '.oxfmtrc.json',
  '!apps/web/dist/**',
  '!apps/web/node_modules/**',
  '!apps/web/coverage/**',
  '!apps/web/*.tsbuildinfo',
  '!node_modules',
  '!node_modules/.vite-temp',
  '!node_modules/.vite-temp/**',
]
// Native Python/Rust and Tauri checks keep their existing commands and caches.
// The web bundler and its contract/budget checks stay in the package script.
export default defineConfig({
  run: {
    tasks: {
      'orch:toolchain': {
        command: cacheable ? `node scripts/orch-toolchain.mjs --expect ${toolchain}` : 'node -e 0',
        cache: false,
      },
      'orch:build': {
        command: `${prefix}bun run --cwd apps/web build`,
        dependsOn: preflight,
        cache: cacheable
          ? { input, output: ['apps/web/dist/**'], env: ['NODE_ENV', 'VITE_*', 'TAURI_ENV_*'] }
          : false,
      },
      'orch:typecheck': {
        command: `${prefix}bun check -p tsconfig.tooling.json && ${prefix}bun run --cwd apps/web typecheck`,
        dependsOn: preflight,
        cache: cacheable ? { input } : false,
      },
      'orch:dev': {
        command: 'bun run --cwd apps/web dev',
        dependsOn: preflight,
        cache: false,
      },
    },
  },
})
