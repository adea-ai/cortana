#!/usr/bin/env node

import { readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildTestGroups, resolveMaxParallel, scheduleGroups } from './js-test-groups.mjs'
import { describeTestGroup, runTestGroup } from './js-test-group-runner.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const testRoots = ['apps/web/src', 'apps/web/tooling', 'scripts']
const testSuffixes = ['.test.ts', '.test.tsx', '.test.mjs']
const streamTestProgress = process.env.CI === 'true'

function collectTests(directory) {
  const entries = readdirSync(join(root, directory), { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'target') {
      continue
    }
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectTests(path))
      continue
    }
    if (testSuffixes.some((suffix) => entry.name.endsWith(suffix))) {
      files.push(path)
    }
  }
  return files
}

const tests = testRoots.flatMap(collectTests).toSorted()
if (tests.length === 0) {
  console.error('No JavaScript test files were found.')
  process.exit(1)
}

// Bun's module mocks are process-global. These suites replace the shared API
// bridge and must not share a worker with another replacement. The remaining
// pure/component tests can stay grouped to avoid paying process-startup cost
// for every small unit file.
const bun = process.env.BUN_BIN || (process.versions.bun ? process.execPath : 'bun')
const bunArgs = [
  'test',
  // Solid apps must resolve the browser build of solid-js/web (and Kobalte),
  // not the server build Bun picks by default in a non-browser environment.
  // Shared UI consumers resolve the installed package exports; the browser
  // condition also keeps their Solid/Kobalte dependencies on the DOM build.
  '--conditions=browser',
  '--isolate',
  '--parallel=1',
  '--max-concurrency=1',
  '--timeout=20000',
  ...(!streamTestProgress ? ['--reporter', 'dots'] : []),
]
const isolatedNames = new Set([
  'App.desktop.test.tsx',
  'desktop-macos-lifecycle-acceptance.test.mjs',
  'App.test.tsx',
  'App.utility.test.tsx',
  'BuzzCommunities.test.tsx',
  'DiscordChannels.test.tsx',
  'DiscordServers.test.tsx',
  'ProviderModels.test.tsx',
  'SlackWorkspaces.test.tsx',
  'SettingsView.demo.test.tsx',
  'SourceInitialSync.test.tsx',
  'sourceJobs.test.ts',
  'Workspace.sourceLink.test.tsx',
  'prepare-desktop-resources.test.mjs',
])
const exclusiveNames = new Set([
  'App.desktop.test.tsx',
  // Probes the live desktop process through AppleScript; run alone so UI
  // scripting latency never contends with other suites.
  'desktop-macos-lifecycle-acceptance.test.mjs',
  'App.utility.test.tsx',
  'SourceInitialSync.test.tsx',
  'sourceJobs.test.ts',
  'prepare-desktop-resources.test.mjs',
])
const groups = buildTestGroups(tests, isolatedNames)
const maxParallel = resolveMaxParallel(groups.length)

// Local group output is buffered until Bun exits. In CI, use Bun's named
// console reporter and stream output so a stalled group leaves its last
// completed test or import boundary in the Actions log. The per-group ceiling
// still bounds transform/import stalls outside `--timeout`. Five minutes is
// far above a healthy group wall — the whole JS lane normally settles in under
// 150 seconds.
// The shared non-isolated group holds ~44 files and settled in ~250s on CI
// runners before brushing the old ceiling (three "exceeded 300s" lane kills on
// 2026-10-05/06/07, each green on rerun — real work near the wall, not a
// wedge). 420s restores headroom; JS_GROUP_TIMEOUT_MS still overrides.
const groupTimeoutMs = Number(process.env.JS_GROUP_TIMEOUT_MS ?? 420_000)

// Bun spawns its own worker processes, and a signal to the direct child does
// not reach them — the orphan keeps the output pipe open and `close` never
// fires, which is exactly how a timeout fails to fail. Spawn each group as
// its own process-group leader so signals reach the whole tree.
function runGroup(group) {
  const labels = group.map((test) => relative(root, join(root, test)))
  if (streamTestProgress) {
    console.log(`[js-test] starting ${describeTestGroup(labels)}`)
  }
  return runTestGroup({
    labels,
    command: bun,
    args: [...bunArgs, ...group],
    cwd: root,
    env: process.env,
    timeoutMs: groupTimeoutMs,
    ci: streamTestProgress,
    onTimeout: (message) => console.error(message),
  })
}

const results = Array(groups.length)
for (const batch of scheduleGroups(groups, maxParallel, exclusiveNames)) {
  const batchResults = await Promise.all(batch.map((index) => runGroup(groups[index])))
  batch.forEach((index, offset) => {
    results[index] = batchResults[offset]
  })
}

for (const result of results) {
  const timeoutMark = result.timedOut ? ' — TIMED OUT, partial output follows' : ''
  console.log(
    `\n▶ ${describeTestGroup(result.labels)} (${(result.durationMs / 1000).toFixed(2)}s)${timeoutMark}`
  )
  if (result.output && !streamTestProgress) process.stdout.write(result.output)
  if (result.code !== 0) {
    console.error(`JavaScript test group failed: ${describeTestGroup(result.labels)}`)
  }
}

const failed = results.filter((result) => result.code !== 0)
if (failed.length > 0) process.exit(failed[0].code || 1)

console.log(
  `\nPassed ${tests.length} JavaScript test files in ${maxParallel} parallel group(s); API-mock suites ran in isolated processes.`
)
