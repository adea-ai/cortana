// Identifies the toolchain the `orch:*` tasks run on, so every one of their cache keys covers it
// without anyone setting a label.
//
// Vite Task fingerprints a task's command text, declared environment variables and the files it reads,
// but not the `node` or `bun` binary or the platform. `vite.config.ts` therefore calls `identity()` every
// time `vp` loads it and writes the result into the text of each cached `orch:*` command
// (`ORCH_TOOLCHAIN=<id> bun run ...`), so a different Node, Bun or platform is a different key. The id
// lives in the invocation's own task graph, not in a file, so two `vp` invocations in one checkout with
// different toolchains cannot see each other's.
//
// The config process cannot be trusted to see what the tasks will, so every invocation also runs the
// uncached `orch:toolchain` task first (`node orch-toolchain.mjs --expect <id>`), with the PATH the tasks
// really get. It recomputes the id and exits non-zero unless it equals the one written into the commands;
// the dependent tasks then do not run and nothing is read from or stored in the cache.
//
// The id holds each binary's version and a hash of its bytes, the platform and the libc, never a path: the
// same bytes at another path (another checkout, a CI runner) keep their entries.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  accessSync,
  closeSync,
  constants,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The marker written into commands when the toolchain could not be identified. It never matches. */
export const UNIDENTIFIED = 'unidentified'

function onPath(name, searchPath) {
  for (const dir of searchPath.split(delimiter)) {
    if (!dir) continue
    // Native executables are invoked directly; .cmd launchers require a shell
    // and do not identify the executable whose bytes belong in the cache key.
    const names = process.platform === 'win32' ? [`${name}.exe`, name] : [name]
    for (const filename of names) {
      const candidate = join(dir, filename)
      try {
        accessSync(candidate, constants.X_OK)
        if (statSync(candidate).isFile()) return realpathSync(candidate)
      } catch {
        // not in this directory
      }
    }
  }
  return undefined
}

const memoFile = (root) => join(root, 'node_modules', '.cache', 'orch-toolchain-memo.json')

function readMemo(root) {
  try {
    return JSON.parse(readFileSync(memoFile(root), 'utf8'))
  } catch {
    return {}
  }
}

/** sha256 of a file, remembered by path, size and modification time (a hash cache, not an identity). */
function sha256(file, memo, root) {
  const before = statSync(file)
  const key = `${file}:${before.size}:${before.mtimeMs}`
  if (memo[key]) return memo[key]
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(1 << 20)
  const fd = openSync(file, 'r')
  try {
    for (;;) {
      const read = readSync(fd, buffer, 0, buffer.length, null)
      if (read === 0) break
      hash.update(buffer.subarray(0, read))
    }
  } finally {
    closeSync(fd)
  }
  const digest = hash.digest('hex')
  const after = statSync(file)
  // A file replaced while it was read is not remembered.
  if (after.size === before.size && after.mtimeMs === before.mtimeMs) {
    for (const old of Object.keys(memo)) if (old.startsWith(`${file}:`)) delete memo[old]
    memo[key] = digest
    try {
      mkdirSync(join(root, 'node_modules', '.cache'), { recursive: true })
      // Atomic, so a concurrent invocation never reads a torn memo. Last writer wins; a lost entry
      // only costs a rehash.
      const staged = `${memoFile(root)}.${process.pid}`
      writeFileSync(staged, JSON.stringify(memo))
      renameSync(staged, memoFile(root))
    } catch {
      // the memo is an optimisation
    }
  }
  return digest
}

function describe(name, searchPath, memo, root) {
  const file = onPath(name, searchPath)
  if (!file) throw new Error(`\`${name}\` is not on PATH, so the toolchain cannot be identified`)
  let version
  try {
    version = execFileSync(file, ['--version'], { encoding: 'utf8' }).trim()
  } catch (error) {
    throw new Error(`\`${name} --version\` failed: ${error.message}`, { cause: error })
  }
  if (!version) throw new Error(`\`${name} --version\` printed nothing`)
  // Vite+ may prepend a transparent package-manager launcher only when the
  // task starts. Identify the executable it actually runs, not the launcher
  // text (which is identical across OSes and different from the direct binary).
  let executable
  try {
    executable = execFileSync(file, ['-p', 'process.execPath'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: searchPath },
    }).trim()
    if (!executable || !statSync(executable).isFile()) throw new Error('invalid executable path')
  } catch (error) {
    throw new Error(`\`${name}\` executable probe failed: ${error.message}`, { cause: error })
  }
  return { version, sha256: sha256(realpathSync(executable), memo, root) }
}

/**
 * The identity of the `node` and `bun` found on `searchPath`, and of the platform. Throws when it
 * cannot be established.
 */
export function identity({ root = repoRoot, searchPath = process.env.PATH ?? '' } = {}) {
  const memo = readMemo(root)
  const libc = process.report?.getReport?.().header?.glibcVersionRuntime
  return {
    platform: `${process.platform}-${process.arch}`,
    libc: libc ? `glibc${libc}` : process.platform === 'linux' ? 'non-glibc' : 'na',
    node: describe('node', searchPath, memo, root),
    bun: describe('bun', searchPath, memo, root),
  }
}

const clean = (text) => text.replace(/^v/, '').replace(/[^A-Za-z0-9.]+/g, '_')

/** A short, shell-safe id that goes into command text. */
export function idOf(found) {
  return [
    found.platform,
    found.libc,
    `node${clean(found.node.version)}-${found.node.sha256.slice(0, 12)}`,
    `bun${clean(found.bun.version)}-${found.bun.sha256.slice(0, 12)}`,
  ].join('.')
}

/**
 * The id the tasks of the invocation that is loading `vite.config.ts` are expected to run on. `vp` runs
 * tasks with `node_modules/.bin` first and the package-manager `bun` ahead of the shell's, and gives the
 * config process the latter already, so the workspace `.bin` is the one directory added here.
 */
export function expectedId(root = repoRoot) {
  try {
    const searchPath = [join(root, 'node_modules', '.bin'), process.env.PATH ?? ''].join(delimiter)
    return idOf(identity({ root, searchPath }))
  } catch {
    return UNIDENTIFIED
  }
}

function verify(expected) {
  let actual
  try {
    actual = idOf(identity())
  } catch (error) {
    console.error(`orch-toolchain: ${error.message}`)
    return 1
  }
  if (expected === UNIDENTIFIED) {
    console.error(
      'orch-toolchain: the toolchain could not be identified when the tasks were loaded'
    )
    return 1
  }
  if (actual !== expected) {
    console.error(
      `orch-toolchain: the tasks run on ${actual}, but their cache keys were written for ${expected}`
    )
    return 1
  }
  console.log(`toolchain ${actual}`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf('--expect')
  const expected = at === -1 ? undefined : process.argv[at + 1]
  if (!expected) {
    console.error('orch-toolchain: usage: orch-toolchain.mjs --expect <id>')
    process.exit(2)
  }
  process.exit(verify(expected))
}
