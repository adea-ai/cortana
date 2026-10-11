export function createProcessTreeTerminator({
  child,
  signalTreeFn,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  gracePeriodMs = 5_000,
}) {
  let settled = false
  let escalationTimer = null

  const settle = () => {
    settled = true
    if (escalationTimer !== null) {
      clearTimeoutFn(escalationTimer)
      escalationTimer = null
    }
  }

  const terminate = () => {
    if (settled) return
    signalTreeFn(child, 'SIGTERM')
    // Test doubles and unusual child implementations can emit close
    // synchronously from SIGTERM. Do not leave a stale-PID SIGKILL queued.
    if (settled) return
    escalationTimer = setTimeoutFn(() => {
      escalationTimer = null
      if (!settled) signalTreeFn(child, 'SIGKILL')
    }, gracePeriodMs)
  }

  return { settle, terminate }
}
