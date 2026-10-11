import { expect, test } from 'bun:test'

import {
  createTestProgressTracker,
  formatGroupTimeoutDiagnostics,
  parseProcessGroupMembers,
} from './js-test-process-diagnostics.mjs'

test('test progress retains a known test result and redacts secret-shaped text', () => {
  const tracker = createTestProgressTracker([
    'scripts/desktop-host-launch.test.mjs',
    'scripts/static-web-server.test.mjs',
  ])

  tracker.push(
    '\u001b[32mscripts/desktop-host-launch.test.mjs:\u001b[0m\n(pass) host process rejects token=private-value [3.20ms]\n'
  )
  tracker.push('unknown/test.test.mjs:\n(pass) ignored [1ms]\n')

  expect(tracker.snapshot()).toEqual({
    file: 'scripts/desktop-host-launch.test.mjs',
    status: 'pass',
    name: 'host process rejects token=[REDACTED]',
  })
})

test('process-group parsing ignores unrelated groups and bounds process identifiers', () => {
  const table = [
    '4200 1000 4200 bun.exe',
    '4201 4200 4200 node',
    '4202 1 4200 python3',
    '4300 4200 4300 unrelated',
    '4203 4200 4200 token=secret-value',
  ].join('\n')

  expect(parseProcessGroupMembers(table, 4200, 3)).toEqual({
    members: [
      { pid: 4200, ppid: 1000, name: 'bun.exe' },
      { pid: 4201, ppid: 4200, name: 'node' },
      { pid: 4202, ppid: 1, name: 'python3' },
    ],
    total: 4,
  })
})

test('timeout diagnostic is bounded and lists test context and safe process fields only', () => {
  const diagnostic = formatGroupTimeoutDiagnostics({
    groupFiles: Array.from({ length: 100 }, (_, index) => `scripts/test-${index}.test.mjs`),
    timeoutMs: 420_000,
    progress: {
      file: 'scripts/desktop-host-launch.test.mjs',
      status: 'pass',
      name: 'host launch completed token=[REDACTED]',
    },
    snapshot: {
      available: true,
      total: 2,
      members: [
        { pid: 4200, ppid: 1000, name: 'bun.exe' },
        { pid: 4201, ppid: 4200, name: 'node' },
      ],
    },
  })

  expect(diagnostic).toContain('timeout after 420s')
  expect(diagnostic).toContain('scripts/desktop-host-launch.test.mjs :: host launch completed')
  expect(diagnostic).toContain('pid=4201 ppid=4200 exe=node')
  expect(diagnostic).not.toContain('secret-value')
  expect(diagnostic.length).toBeLessThanOrEqual(1_800)
})
