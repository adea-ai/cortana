import { spawn } from 'node:child_process'
import { createProcessTreeTerminator } from './child-process-termination.mjs'

export function signalTree(child, signal) {
  try {
    if (child.pid) process.kill(-child.pid, signal)
  } catch {
    child.kill(signal)
  }
}

export function replayBufferedOutput(result, target = process.stdout) {
  if (result.output && !result.streamed) target.write(result.output)
}

export function runUnitLane({
  name,
  command,
  args,
  cwd,
  env,
  timeoutMs,
  ci = false,
  onChild = () => {},
  onTimeout = (message) => console.error(message),
  stdout = process.stdout,
  stderr = process.stderr,
  spawnProcess = spawn,
  signalTreeFn = signalTree,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  now = () => performance.now(),
}) {
  const startedAt = now()
  return new Promise((resolveResult) => {
    const child = spawnProcess(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    })
    onChild(child)
    let settled = false
    const terminator = createProcessTreeTerminator({
      child,
      signalTreeFn,
      setTimeoutFn,
      clearTimeoutFn,
    })
    let output = ''
    const append = (chunk, target) => {
      output += chunk
      if (ci) target.write(chunk)
    }
    child.stdout.on('data', (chunk) => append(chunk, stdout))
    child.stderr.on('data', (chunk) => append(chunk, stderr))
    let timedOut = false
    const killTimer = setTimeoutFn(() => {
      if (settled) return
      timedOut = true
      const progress = ci
        ? 'partial output was streamed as it arrived'
        : 'partial output will be shown when the remaining lanes settle'
      onTimeout(
        `[unit-lane] ${name} exceeded ${(timeoutMs / 1000).toFixed(0)}s; killing it — ${progress}`
      )
      terminator.terminate()
    }, timeoutMs)
    child.once('error', (error) => {
      settled = true
      clearTimeoutFn(killTimer)
      terminator.settle()
      resolveResult({
        name,
        code: 1,
        timedOut: false,
        output: `failed to start ${command}: ${error.message}`,
        streamed: false,
        durationMs: now() - startedAt,
      })
    })
    child.once('close', (code) => {
      settled = true
      clearTimeoutFn(killTimer)
      terminator.settle()
      resolveResult({
        name,
        code: timedOut ? 1 : (code ?? 1),
        timedOut,
        output,
        streamed: ci,
        durationMs: now() - startedAt,
      })
    })
  })
}
