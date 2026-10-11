#!/usr/bin/env node

// Runs the independent `test:unit` lanes concurrently. The previous npm script
// chained them serially, so wall time was the sum of every lane; the lanes share
// no state, so running them together makes wall time the slowest lane.
// The bundle-budget check already runs inside `apps/web`'s build script, so the
// web lane covers the trailing budget gate from the old serial chain.
import { spawnSync } from 'node:child_process'
import { replayBufferedOutput, runUnitLane, signalTree } from './unit-lane-runner.mjs'

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

// Lane output used to be buffered until the lane closed, so a wedged lane ran
// silently until the job's 30-minute ceiling. The per-lane ceiling below turns
// that into a fast failure that names the lane; bun's per-test timeout does
// not bound the transform/import phase where the observed hangs live. Ten
// minutes is ~3.5x the slowest healthy lane (eval).
const laneTimeoutMs = Number(process.env.UNIT_LANE_TIMEOUT_MS ?? 600_000)

const children = []
// Lanes spawn their own children (bun workers, sh -c compounds, vite), and a
// signal to the direct child does not reach them — the orphan then keeps the
// output pipe open and `close` never fires, which is exactly how a timeout
// fails to fail. Spawn each lane as its own process-group leader so signals
// can be delivered to the whole tree.
const shutdown = (signal) => {
  for (const child of children) signalTree(child, signal)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

const results = await Promise.all(
  selected.map(([name, [command, ...args]]) => {
    console.log(`[unit-lane] ${name}: ${command} ${args.join(' ')}`)
    return runUnitLane({
      name,
      command,
      args,
      cwd: new URL('..', import.meta.url),
      env: process.env,
      timeoutMs: laneTimeoutMs,
      ci: process.env.CI === 'true',
      onChild: (child) => children.push(child),
      onTimeout: (message) => console.error(message),
    })
  })
)

for (const result of results) {
  const timeoutMark = result.timedOut
    ? result.streamed
      ? ' — TIMED OUT; partial output was streamed above'
      : ' — TIMED OUT, partial output follows'
    : ''
  console.log(
    `\n=== ${result.name} (${((result.durationMs ?? 0) / 1000).toFixed(2)}s) ===${timeoutMark}`
  )
  // CI output already reached its original stream. Keep the captured copy on
  // the result for diagnosis without replaying it.
  replayBufferedOutput(result)
}

const failed = results.filter((result) => result.code !== 0)
if (failed.length > 0) {
  console.error(`\nUnit lanes failed: ${failed.map((result) => result.name).join(', ')}`)
  process.exit(failed[0].code || 1)
}
console.log(`\nAll ${results.length} unit lanes passed.`)
