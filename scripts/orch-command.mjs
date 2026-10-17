// Run cached Bun tasks with the same environment on POSIX and Windows.
// Keeping the toolchain id in the command text fingerprints it before replay.
import { spawnSync } from 'node:child_process'

const [expected, ...args] = process.argv.slice(2)
if (!expected || expected === 'unidentified' || args.length === 0) {
  console.error('orch-command: identified toolchain and Bun arguments are required')
  process.exit(2)
}
const env = { ...process.env, ORCH_TOOLCHAIN: expected }
delete env.FORCE_COLOR
const result = spawnSync(process.platform === 'win32' ? 'bun.exe' : 'bun', args, {
  env,
  stdio: 'inherit',
})
if (result.error) console.error(`orch-command: ${result.error.message}`)
process.exit(result.status ?? 1)
