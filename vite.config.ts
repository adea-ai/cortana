import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'
import { expectedId } from './scripts/orch-toolchain.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const toolchain = expectedId(root)
// A Node launcher sets the task environment without POSIX-only shell syntax.
const prefix = `node scripts/orch-command.mjs ${toolchain} `
const preflight = ['orch:toolchain']
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
        command: `node scripts/orch-toolchain.mjs --expect ${toolchain}`,
        cache: false,
      },
      'orch:build': {
        command: `${prefix}run --cwd apps/web build`,
        dependsOn: preflight,
        cache: { input, output: ['apps/web/dist/**'], env: ['NODE_ENV', 'VITE_*', 'TAURI_ENV_*'] },
      },
      'orch:typecheck': {
        command: `${prefix}check -p tsconfig.tooling.json && ${prefix}run --cwd apps/web typecheck`,
        dependsOn: preflight,
        cache: { input },
      },
      'orch:dev': {
        command: 'bun run --cwd apps/web dev',
        dependsOn: preflight,
        cache: false,
      },
    },
  },
})
