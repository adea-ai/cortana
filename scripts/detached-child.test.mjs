import { EventEmitter } from 'node:events'

import { describe, expect, test } from 'bun:test'

import { stopDetachedChild } from './detached-child.mjs'

function fakeChild({ exitOnSignal = true } = {}) {
  const child = new EventEmitter()
  child.pid = 4242
  child.exitCode = null
  child.signals = []
  child.kill = (signal) => {
    child.signals.push(signal)
    if (exitOnSignal) {
      child.exitCode = 0
      child.emit('exit', 0, signal)
    }
  }
  return child
}

describe('stopDetachedChild', () => {
  test('kills the child directly on Windows instead of using a POSIX process group', async () => {
    const child = fakeChild()
    const groupSignals = []

    await stopDetachedChild(child, {
      platform: 'win32',
      killProcess: (...args) => groupSignals.push(args),
      gracePeriodMs: 0,
    })

    expect(groupSignals).toEqual([])
    expect(child.signals).toEqual(['SIGTERM'])
  })

  test('terminates the detached POSIX process group', async () => {
    const child = fakeChild({ exitOnSignal: false })
    const groupSignals = []
    const killProcess = (...args) => {
      groupSignals.push(args)
      child.exitCode = 0
      child.emit('exit', 0, args[1])
    }

    await stopDetachedChild(child, {
      platform: 'linux',
      killProcess,
      gracePeriodMs: 0,
    })

    expect(groupSignals).toEqual([[-4242, 'SIGTERM']])
    expect(child.signals).toEqual([])
  })

  test('escalates a Windows child that ignores graceful termination', async () => {
    const child = fakeChild({ exitOnSignal: false })

    await stopDetachedChild(child, { platform: 'win32', gracePeriodMs: 0 })

    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL'])
  })
})
