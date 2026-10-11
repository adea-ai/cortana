import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { expect, test } from 'bun:test'

import { replayBufferedOutput, runUnitLane } from './unit-lane-runner.mjs'

class FakeChild extends EventEmitter {
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

function createSink() {
  const chunks = []
  return {
    chunks,
    write(chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk))
      return true
    },
  }
}

function clearFakeTimer(timer) {
  timer.cleared = true
}

function createRun({ ci, child = new FakeChild(), ...options }) {
  const stdout = createSink()
  const stderr = createSink()
  const promise = runUnitLane({
    name: 'fake',
    command: 'fake-command',
    args: ['--flag'],
    cwd: '/tmp',
    env: {},
    timeoutMs: 2_000,
    ci,
    spawnProcess: () => child,
    signalTreeFn: (target, signal) => target.kill(signal),
    stdout,
    stderr,
    ...options,
  })
  return { child, promise, stdout, stderr }
}

test('CI streams stdout and stderr once while retaining the captured output', async () => {
  const { child, promise, stdout, stderr } = createRun({ ci: true })

  child.stdout.write('stdout progress\n')
  child.stderr.write('stderr warning\n')
  expect(stdout.chunks).toEqual(['stdout progress\n'])
  expect(stderr.chunks).toEqual(['stderr warning\n'])

  child.stdout.end()
  child.stderr.end()
  child.emit('close', 0)
  const result = await promise

  expect(result).toMatchObject({ code: 0, timedOut: false, streamed: true })
  expect(result.output).toBe('stdout progress\nstderr warning\n')
  expect(stdout.chunks).toEqual(['stdout progress\n'])
  expect(stderr.chunks).toEqual(['stderr warning\n'])
  const replay = createSink()
  replayBufferedOutput(result, replay)
  expect(replay.chunks).toEqual([])
})

test('CI preserves a nonzero child exit and captures output without replaying it', async () => {
  const { child, promise, stdout, stderr } = createRun({ ci: true })
  child.stdout.write('before failure\n')
  child.stderr.write('failure detail\n')
  child.stdout.end()
  child.stderr.end()
  child.emit('close', 7)

  const result = await promise
  expect(result).toMatchObject({ code: 7, timedOut: false, streamed: true })
  expect(result.output).toBe('before failure\nfailure detail\n')
  expect(stdout.chunks).toEqual(['before failure\n'])
  expect(stderr.chunks).toEqual(['failure detail\n'])
  const replay = createSink()
  replayBufferedOutput(result, replay)
  expect(replay.chunks).toEqual([])
})

test('timeout keeps partial output, reports once, and preserves the exit failure', async () => {
  const timers = []
  const timeoutMessages = []
  const setTimeoutFn = (callback, delayMs) => {
    const timer = { callback, delayMs, cleared: false }
    timers.push(timer)
    return timer
  }
  const { child, promise, stdout, stderr } = createRun({
    ci: true,
    timeoutMs: 2_000,
    setTimeoutFn,
    clearTimeoutFn: clearFakeTimer,
    onTimeout: (message) => timeoutMessages.push(message),
  })
  child.stdout.write('partial progress\n')
  child.stdout.end()
  child.stderr.end()
  child.onSignal = (signal) => {
    if (signal === 'SIGTERM') child.emit('close', null)
  }

  timers.find((timer) => timer.delayMs === 2_000).callback()
  const result = await promise

  expect(result).toMatchObject({ code: 1, timedOut: true, streamed: true })
  expect(result.output).toBe('partial progress\n')
  expect(child.signals).toEqual(['SIGTERM'])
  expect(stdout.chunks).toEqual(['partial progress\n'])
  expect(stderr.chunks).toEqual([])
  const replay = createSink()
  replayBufferedOutput(result, replay)
  expect(replay.chunks).toEqual([])
  expect(timeoutMessages).toEqual([
    '[unit-lane] fake exceeded 2s; killing it — partial output was streamed as it arrived',
  ])
  expect(timers.some((timer) => timer.delayMs === 5_000)).toBe(false)
})

test('timeout escalates to SIGKILL when the child tree ignores SIGTERM', async () => {
  const timers = []
  const setTimeoutFn = (callback, delayMs) => {
    const timer = { callback, delayMs, cleared: false }
    timers.push(timer)
    return timer
  }
  const { child, promise } = createRun({
    ci: true,
    setTimeoutFn,
    clearTimeoutFn: clearFakeTimer,
  })
  child.onSignal = (signal) => {
    if (signal === 'SIGKILL') child.emit('close', null)
  }

  timers.find((timer) => timer.delayMs === 2_000).callback()
  expect(child.signals).toEqual(['SIGTERM'])
  expect(timers.map(({ delayMs }) => delayMs)).toEqual([2_000, 5_000])

  timers.find((timer) => timer.delayMs === 5_000).callback()
  const result = await promise

  expect(result).toMatchObject({ code: 1, timedOut: true, streamed: true })
  expect(child.signals).toEqual(['SIGTERM', 'SIGKILL'])
  expect(timers.find((timer) => timer.delayMs === 5_000).cleared).toBe(false)
})

test('local mode buffers child output and leaves replay to the lane summary', async () => {
  const { child, promise, stdout, stderr } = createRun({ ci: false })
  child.stdout.write('buffered stdout\n')
  child.stderr.write('buffered stderr\n')

  expect(stdout.chunks).toEqual([])
  expect(stderr.chunks).toEqual([])

  child.stdout.end()
  child.stderr.end()
  child.emit('close', 0)
  const result = await promise

  expect(result).toMatchObject({ code: 0, timedOut: false, streamed: false })
  expect(result.output).toBe('buffered stdout\nbuffered stderr\n')
  expect(stdout.chunks).toEqual([])
  expect(stderr.chunks).toEqual([])
  const replay = createSink()
  replayBufferedOutput(result, replay)
  expect(replay.chunks).toEqual(['buffered stdout\nbuffered stderr\n'])
})
