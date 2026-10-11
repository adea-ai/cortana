import { spawn } from 'node:child_process'

import { createProcessTreeTerminator } from './child-process-termination.mjs'
import {
  createTestProgressTracker,
  formatGroupTimeoutDiagnostics,
  snapshotProcessGroup,
} from './js-test-process-diagnostics.mjs'

export function signalGroupTree(child, signal) {
  try {
    if (child.pid) process.kill(-child.pid, signal)
  } catch {
    child.kill(signal)
  }
}

export function describeTestGroup(labels) {
  const first = labels[0] ?? 'unknown test group'
  return labels.length > 1 ? `${first} (+${labels.length - 1} files)` : first
}

function forwardChunk(chunk, target, capture, progress, ci) {
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
  capture(text)
  progress.push(text)
  if (ci) target.write(chunk)
}

export function runTestGroup({
  labels,
  command,
  args,
  cwd,
  env,
  timeoutMs,
  ci = false,
  onTimeout = (message) => console.error(message),
  stdout = process.stdout,
  stderr = process.stderr,
  spawnProcess = spawn,
  signalTreeFn = signalGroupTree,
  processSnapshot = snapshotProcessGroup,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  now = () => performance.now(),
}) {
  const started = now()
  const progress = createTestProgressTracker(labels)

  return new Promise((resolveResult) => {
    const child = spawnProcess(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    })
    let settled = false
    let stdoutText = ''
    let stderrText = ''
    const terminator = createProcessTreeTerminator({
      child,
      signalTreeFn,
      setTimeoutFn,
      clearTimeoutFn,
    })
    child.stdout.on('data', (chunk) => {
      forwardChunk(chunk, stdout, (text) => (stdoutText += text), progress, ci)
    })
    child.stderr.on('data', (chunk) => {
      forwardChunk(chunk, stderr, (text) => (stderrText += text), progress, ci)
    })

    let timedOut = false
    const killTimer = setTimeoutFn(() => {
      if (settled) return
      timedOut = true
      let snapshot
      try {
        snapshot = processSnapshot(child.pid)
      } catch {
        snapshot = { available: false, reason: 'process list unavailable', members: [], total: 0 }
      }
      onTimeout(
        formatGroupTimeoutDiagnostics({
          groupFiles: labels,
          timeoutMs,
          progress: progress.snapshot(),
          snapshot,
        })
      )
      terminator.terminate()
    }, timeoutMs)

    child.once('error', (error) => {
      settled = true
      clearTimeoutFn(killTimer)
      terminator.settle()
      resolveResult({
        labels,
        code: 1,
        timedOut: false,
        output: `Failed to start test runner: ${error.message}`,
        durationMs: now() - started,
      })
    })
    child.once('close', (code) => {
      settled = true
      clearTimeoutFn(killTimer)
      terminator.settle()
      resolveResult({
        labels,
        code: timedOut ? 1 : (code ?? 1),
        timedOut,
        output: `${stdoutText}${stderrText}`,
        durationMs: now() - started,
      })
    })
  })
}
