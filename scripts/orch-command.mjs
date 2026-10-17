// Run cached Bun tasks with the same environment on POSIX and Windows.
// Keeping the toolchain id in the command text fingerprints it before replay.
import { spawnSync } from 'node:child_process'
import { runtimeExecutable } from './orch-toolchain.mjs'

const [expected, ...args] = process.argv.slice(2)
if (!expected || expected === 'unidentified' || args.length === 0) {
  console.error('orch-command: identified toolchain and Bun arguments are required')
  process.exit(2)
}
// Mutate only these two values; enumerating process.env would make the task
// tracker observe unrelated CI variables and spoil fresh-runner cache reuse.
process.env.ORCH_TOOLCHAIN = expected
delete process.env.FORCE_COLOR
let executable
try {
  executable = runtimeExecutable('bun')
} catch (error) {
  console.error(`orch-command: ${error.message}`)
  process.exit(1)
}
const result = spawnSync(executable, args, {
  stdio: 'inherit',
})
if (result.error) console.error(`orch-command: ${result.error.message}`)
process.exit(result.status ?? 1)
