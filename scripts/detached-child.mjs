export async function stopDetachedChild(
  child,
  { platform = process.platform, killProcess = process.kill, gracePeriodMs = 2_000 } = {}
) {
  if (!child?.pid || child.exitCode !== null) return

  const kill = (signal) => {
    if (platform === 'win32') {
      child.kill(signal)
      return
    }

    try {
      killProcess(-child.pid, signal)
    } catch (error) {
      if (error?.code !== 'ESRCH') child.kill(signal)
    }
  }

  kill('SIGTERM')
  await Promise.race([
    new Promise((resolveWait) => child.once('exit', resolveWait)),
    new Promise((resolveWait) => setTimeout(resolveWait, gracePeriodMs)),
  ])
  if (child.exitCode === null) kill('SIGKILL')
}
