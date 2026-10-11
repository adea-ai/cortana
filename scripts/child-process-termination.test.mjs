import { expect, test } from 'bun:test'

import { createProcessTreeTerminator } from './child-process-termination.mjs'

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

test('process-tree termination does not queue SIGKILL after synchronous close on SIGTERM', () => {
  const harness = timerHarness()
  const signals = []
  const child = { close: null }
  const terminator = createProcessTreeTerminator({
    child,
    signalTreeFn(target, signal) {
      signals.push(signal)
      if (signal === 'SIGTERM') target.close()
    },
    setTimeoutFn: harness.setTimeoutFn,
    clearTimeoutFn: harness.clearTimeoutFn,
  })
  child.close = () => terminator.settle()

  terminator.terminate()

  expect(signals).toEqual(['SIGTERM'])
  expect(harness.timers).toEqual([])
})

test('process-tree termination escalates after the grace period when TERM is ignored', () => {
  const harness = timerHarness()
  const signals = []
  const child = { close: null }
  const terminator = createProcessTreeTerminator({
    child,
    signalTreeFn(target, signal) {
      signals.push(signal)
      if (signal === 'SIGKILL') target.close()
    },
    setTimeoutFn: harness.setTimeoutFn,
    clearTimeoutFn: harness.clearTimeoutFn,
  })
  child.close = () => terminator.settle()

  terminator.terminate()
  expect(signals).toEqual(['SIGTERM'])
  expect(harness.timers.map(({ delayMs }) => delayMs)).toEqual([5_000])

  harness.timers[0].callback()

  expect(signals).toEqual(['SIGTERM', 'SIGKILL'])
  expect(harness.timers[0].cleared).toBe(false)
})

test('process-tree termination clears a pending escalation when the tree closes', () => {
  const harness = timerHarness()
  const signals = []
  const child = { close: null }
  const terminator = createProcessTreeTerminator({
    child,
    signalTreeFn(_target, signal) {
      signals.push(signal)
    },
    setTimeoutFn: harness.setTimeoutFn,
    clearTimeoutFn: harness.clearTimeoutFn,
  })
  child.close = () => terminator.settle()

  terminator.terminate()
  child.close()

  expect(signals).toEqual(['SIGTERM'])
  expect(harness.timers).toHaveLength(1)
  expect(harness.timers[0].cleared).toBe(true)
  harness.timers[0].callback()
  expect(signals).toEqual(['SIGTERM'])
})
