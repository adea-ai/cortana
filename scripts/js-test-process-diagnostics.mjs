import { spawnSync } from 'node:child_process'

const MAX_DIAGNOSTIC_CHARS = 1_800
const MAX_PROCESS_ROWS = 8
const MAX_TEST_NAME_CHARS = 180

function safeTestName(value) {
  return (
    String(value)
      .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
      .replace(
        /\b(password|passwd|token|secret|api[_-]?key|private[_-]?key|authorization)\b\s*[:=]\s*[^\s,;]+/gi,
        '$1=[REDACTED]'
      )
      // eslint-disable-next-line no-control-regex -- strip control characters from test labels
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TEST_NAME_CHARS)
  )
}

function safeProcessName(value) {
  const name = String(value).trim()
  return /^[A-Za-z0-9_.+-]{1,32}$/.test(name) ? name : 'other'
}

export function createTestProgressTracker(groupFiles) {
  const knownFiles = new Set(groupFiles)
  let currentFile = null
  let lastReportedTest = null
  let pending = ''

  const consumeLine = (line) => {
    // eslint-disable-next-line no-control-regex -- strip ANSI color codes from reporter headers
    const plain = line.replace(/\u001b\[[0-9;]*m/g, '').trim()
    const fileMatch = plain.match(/^(.+\.test\.(?:mjs|tsx?|ts)):\s*$/)
    if (fileMatch) {
      currentFile = knownFiles.has(fileMatch[1]) ? fileMatch[1] : null
      return
    }

    const testMatch = plain.match(/^\((pass|fail|skip|todo)\)\s+(.+?)(?:\s+\[[\d.]+ms\])?$/)
    if (testMatch && currentFile) {
      lastReportedTest = {
        file: currentFile,
        status: testMatch[1],
        name: safeTestName(testMatch[2]),
      }
    }
  }

  return {
    push(chunk) {
      pending += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() ?? ''
      for (const line of lines) consumeLine(line)
      if (pending.length > 2_048) pending = pending.slice(-2_048)
    },
    snapshot() {
      return lastReportedTest ? { ...lastReportedTest } : null
    },
  }
}

export function parseProcessGroupMembers(processTable, processGroupId, limit = MAX_PROCESS_ROWS) {
  const members = []
  for (const line of String(processTable).split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/)
    if (!match || Number(match[3]) !== Number(processGroupId)) continue
    members.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      name: safeProcessName(match[4]),
    })
  }
  members.sort((left, right) => left.pid - right.pid)
  return {
    members: members.slice(0, limit),
    total: members.length,
  }
}

export function snapshotProcessGroup(processGroupId) {
  if (!Number.isSafeInteger(processGroupId) || processGroupId < 1) {
    return { available: false, reason: 'process group id unavailable', members: [], total: 0 }
  }

  try {
    const result = spawnSync('ps', ['-eo', 'pid=,ppid=,pgid=,comm='], {
      encoding: 'utf8',
      timeout: 250,
      maxBuffer: 64 * 1_024,
      windowsHide: true,
    })
    if (result.error || result.status !== 0) {
      const reason =
        result.error?.code === 'ETIMEDOUT'
          ? 'process snapshot timed out'
          : 'process list unavailable'
      return { available: false, reason, members: [], total: 0 }
    }
    return { available: true, ...parseProcessGroupMembers(result.stdout, processGroupId) }
  } catch {
    return { available: false, reason: 'process list unavailable', members: [], total: 0 }
  }
}

export function formatGroupTimeoutDiagnostics({ groupFiles, timeoutMs, progress, snapshot }) {
  const firstFile = groupFiles[0] ?? 'unknown test group'
  const groupDescription = `${groupFiles.length} test file${groupFiles.length === 1 ? '' : 's'}; starts at ${firstFile}`
  const lines = [`[js-test] timeout after ${(timeoutMs / 1_000).toFixed(0)}s (${groupDescription})`]

  if (progress) {
    lines.push(
      `[js-test] last reported test (${progress.status}): ${progress.file} :: ${progress.name}`
    )
  } else {
    lines.push('[js-test] no named test result was reported before timeout')
  }

  if (!snapshot?.available) {
    lines.push(`[js-test] process snapshot unavailable: ${snapshot?.reason ?? 'not collected'}`)
  } else if (snapshot.members.length === 0) {
    lines.push('[js-test] no process-group members were visible at timeout')
  } else {
    const shown = snapshot.members
      .map(({ pid, ppid, name }) => `pid=${pid} ppid=${ppid} exe=${name}`)
      .join('; ')
    const omitted = Math.max(0, snapshot.total - snapshot.members.length)
    lines.push(
      `[js-test] process-group members (${snapshot.total}; showing ${snapshot.members.length}${omitted ? `, ${omitted} omitted` : ''}): ${shown}`
    )
  }

  return lines.join('\n').slice(0, MAX_DIAGNOSTIC_CHARS)
}
