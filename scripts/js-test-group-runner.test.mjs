import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { expect, test } from 'bun:test'

import { runTestGroup } from './js-test-group-runner.mjs'

class FakeChild extends EventEmitter {
  pid = 4_200
  stdout = new PassThrough()
  stderr = new PassThrough()
  signals = []
  onSignal = () => {}

  kill(signal) {
    this.signals.push(signal)
    this.onSignal(signal)
    return true
  }
}

function sink() {
  const chunks = []
  return {
    chunks,
    write(chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk))
      return true
    },
  }
}

function timerHarness() {
  const timers = []
  return {
    timers,
    setTimeoutFn(callback, delayMs) {
      const timer = { callback, delayMs, cleared: false }
      timers.push(timer)
      return timer
    },
    clearTimeoutFn(timer) {
      if (timer) timer.cleared = true
    },
  }
}

function startFakeGroup({ child, harness, snapshot, sequence, onTimeout }) {
  const stdout = sink()
  const stderr = sink()
  const promise = runTestGroup({
    labels: ['scripts/fake-child.test.mjs', 'scripts/another.test.mjs'],
    command: 'bun',
    args: ['test', 'scripts/fake-child.test.mjs'],
    cwd: '/tmp/cortana-test',
    env: {},
    timeoutMs: 420_000,
    ci: true,
    spawnProcess: () => child,
    signalTreeFn: (target, signal) => target.kill(signal),
    processSnapshot: (pid) => {
      sequence.push(`snapshot:${pid}`)
      return snapshot
    },
    setTimeoutFn: harness.setTimeoutFn,
    clearTimeoutFn: harness.clearTimeoutFn,
    stdout,
    stderr,
    onTimeout: (message) => {
      sequence.push('diagnostic')
      onTimeout(message)
    },
  })
  return { promise, stdout, stderr }
}

test('group timeout identifies last test and child before TERM, then avoids stale KILL after close', async () => {
  const child = new FakeChild()
  const harness = timerHarness()
  const sequence = []
  const diagnostics = []
  child.onSignal = (signal) => {
    sequence.push(signal)
    if (signal === 'SIGTERM') child.emit('close', null)
  }
  const { promise, stdout } = startFakeGroup({
    child,
    harness,
    sequence,
    onTimeout: (message) => diagnostics.push(message),
    snapshot: {
      available: true,
      members: [
        { pid: 4_200, ppid: 1, name: 'bun.exe' },
        { pid: 4_208, ppid: 4_200, name: 'node' },
      ],
      total: 2,
    },
  })
  child.stdout.write(
    'scripts/fake-child.test.mjs:\n(pass) child exits after token=do-not-log [5.00ms]\n'
  )
  child.stdout.end()
  child.stderr.end()

  harness.timers.find(({ delayMs }) => delayMs === 420_000).callback()
  const result = await promise

  expect(result).toMatchObject({ code: 1, timedOut: true })
  expect(result.output).toContain('token=do-not-log')
  expect(stdout.chunks).toEqual([result.output])
  expect(sequence).toEqual(['snapshot:4200', 'diagnostic', 'SIGTERM'])
  expect(diagnostics[0]).toContain(
    'scripts/fake-child.test.mjs :: child exits after token=[REDACTED]'
  )
  expect(diagnostics[0]).toContain('pid=4208 ppid=4200 exe=node')
  expect(diagnostics[0]).not.toContain('do-not-log')
  expect(harness.timers.some(({ delayMs }) => delayMs === 5_000)).toBe(false)
})

test('group timeout escalates to SIGKILL when the fake child tree ignores TERM', async () => {
  const child = new FakeChild()
  const harness = timerHarness()
  const sequence = []
  child.onSignal = (signal) => {
    sequence.push(signal)
    if (signal === 'SIGKILL') child.emit('close', null)
  }
  const { promise } = startFakeGroup({
    child,
    harness,
    sequence,
    onTimeout: () => {},
    snapshot: { available: true, members: [{ pid: 4_200, ppid: 1, name: 'bun.exe' }], total: 1 },
  })
  child.stdout.write('scripts/fake-child.test.mjs:\n(pass) test waits for close [1ms]\n')
  child.stdout.end()
  child.stderr.end()

  harness.timers.find(({ delayMs }) => delayMs === 420_000).callback()
  expect(child.signals).toEqual(['SIGTERM'])
  const escalation = harness.timers.find(({ delayMs }) => delayMs === 5_000)
  expect(escalation).toBeDefined()

  escalation.callback()
  const result = await promise

  expect(result).toMatchObject({ code: 1, timedOut: true })
  expect(child.signals).toEqual(['SIGTERM', 'SIGKILL'])
  expect(escalation.cleared).toBe(false)
})

test('group error clears a pending escalation timer', async () => {
  const child = new FakeChild()
  const harness = timerHarness()
  const { promise } = startFakeGroup({
    child,
    harness,
    sequence: [],
    onTimeout: () => {},
    snapshot: { available: true, members: [{ pid: 4_200, ppid: 1, name: 'bun.exe' }], total: 1 },
  })
  child.stdout.end()
  child.stderr.end()

  harness.timers.find(({ delayMs }) => delayMs === 420_000).callback()
  const escalation = harness.timers.find(({ delayMs }) => delayMs === 5_000)
  expect(escalation).toBeDefined()

  child.emit('error', new Error('fake child error'))
  const result = await promise

  expect(result).toMatchObject({ code: 1, timedOut: false })
  expect(escalation.cleared).toBe(true)
  escalation.callback()
  expect(child.signals).toEqual(['SIGTERM'])
})

test('group timeout keeps descendant escalation after leader exit until pipe close', async () => {
  const child = new FakeChild()
  const harness = timerHarness()
  child.onSignal = (signal) => {
    if (signal === 'SIGTERM') child.emit('exit', null, 'SIGTERM')
    if (signal === 'SIGKILL') child.emit('close', null)
  }
  const { promise } = startFakeGroup({
    child,
    harness,
    sequence: [],
    onTimeout: () => {},
    snapshot: {
      available: true,
      members: [
        { pid: 4_200, ppid: 1, name: 'bun.exe' },
        { pid: 4_211, ppid: 1, name: 'node' },
      ],
      total: 2,
    },
  })
  child.stdout.end()
  child.stderr.end()

  harness.timers.find(({ delayMs }) => delayMs === 420_000).callback()
  expect(child.signals).toEqual(['SIGTERM'])
  expect(harness.timers.find(({ delayMs }) => delayMs === 5_000).cleared).toBe(false)

  harness.timers.find(({ delayMs }) => delayMs === 5_000).callback()
  const result = await promise

  expect(result).toMatchObject({ code: 1, timedOut: true })
  expect(child.signals).toEqual(['SIGTERM', 'SIGKILL'])
})
