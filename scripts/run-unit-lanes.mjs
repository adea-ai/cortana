#!/usr/bin/env node

// Runs the independent `test:unit` lanes concurrently. The previous npm script
// chained them serially, so wall time was the sum of every lane; the lanes share
// no state, so running them together makes wall time the slowest lane.
// The bundle-budget check already runs inside `apps/web`'s build script, so the
// web lane covers the trailing budget gate from the old serial chain.
import { spawn, spawnSync } from 'node:child_process'

// Prefer nextest's process-per-test runner when it is installed: each eval
// case is an independent `cortana` CLI invocation, so they parallelize safely.
// CI installs it when `rust_nextest` is enabled in .github/code-foundry.yml.
const hasNextest = spawnSync('cargo', ['nextest', '--version'], { stdio: 'ignore' }).status === 0

const lanes = [
  ['js', ['bun', 'scripts/run-js-tests.mjs']],
  // Fails fast when Cargo.lock member versions drift from the manifests —
  // release branches hit this only inside the container build otherwise.
  ['lockfile', ['sh', '-c', 'cargo metadata --format-version 1 --locked --offline >/dev/null']],
  ['pytest', ['uv', 'run', 'pytest', '-m', 'not integration and not smoke']],
  ['docs', ['uv', 'run', 'python', 'scripts/check-docs-consistency.py']],
  [
    'eval',
    hasNextest
      ? ['cargo', 'nextest', 'run', '--test', 'evaluation', '--no-capture']
      : ['cargo', 'test', '--test', 'evaluation', '--', '--nocapture'],
  ],
  ['web', ['bun', 'run', '--cwd', 'apps/web', 'build']],
]

const filter = process.argv[2]
const selected = filter ? lanes.filter(([name]) => name === filter) : lanes
if (selected.length === 0) {
  console.error(`Unknown unit lane: ${filter}. Expected one of ${lanes.map(([n]) => n).join(', ')}`)
  process.exit(1)
}

const children = []
const shutdown = (signal) => {
  for (const child of children) child.kill(signal)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

const results = await Promise.all(
  selected.map(
    ([name, [command, ...args]]) =>
      new Promise((resolveResult) => {
        const startedAt = performance.now()
        const child = spawn(command, args, {
          cwd: new URL('..', import.meta.url),
          env: process.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        children.push(child)
        let output = ''
        const append = (chunk) => {
          output += chunk
        }
        child.stdout.on('data', append)
        child.stderr.on('data', append)
        child.once('error', (error) =>
          resolveResult({ name, code: 1, output: `failed to start ${command}: ${error.message}` })
        )
        child.once('close', (code) =>
          resolveResult({
            name,
            code: code ?? 1,
            output,
            durationMs: performance.now() - startedAt,
          })
        )
      })
  )
)

for (const result of results) {
  console.log(`\n=== ${result.name} (${((result.durationMs ?? 0) / 1000).toFixed(2)}s) ===`)
  if (result.output) process.stdout.write(result.output)
}

const failed = results.filter((result) => result.code !== 0)
if (failed.length > 0) {
  console.error(`\nUnit lanes failed: ${failed.map((result) => result.name).join(', ')}`)
  process.exit(failed[0].code || 1)
}
console.log(`\nAll ${results.length} unit lanes passed.`)
