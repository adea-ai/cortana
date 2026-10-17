import { expect, test } from 'bun:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { copyFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { tmpdir } from 'node:os'

const command = fileURLToPath(new URL('./orch-command.mjs', import.meta.url))

test('cached task launcher preserves arguments and environment without a shell', () => {
  const argument = 'literal spaces & $HOME ; "quoted"'
  const output = execFileSync(
    'node',
    [
      command,
      'qualified-toolchain',
      '-e',
      'console.log(JSON.stringify({ id: process.env.ORCH_TOOLCHAIN, color: process.env.FORCE_COLOR ?? null, retained: process.env.ORCH_TEST_RETAINED, argument: process.argv.at(-1) }))',
      argument,
    ],
    { encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '1', ORCH_TEST_RETAINED: 'kept' } }
  )
  expect(JSON.parse(output)).toEqual({
    id: 'qualified-toolchain',
    color: null,
    retained: 'kept',
    argument,
  })
})

test('cached task launcher propagates failure instead of recording success', () => {
  const result = spawnSync('node', [command, 'qualified-toolchain', '-e', 'process.exit(42)'])
  expect(result.status).toBe(42)
})

test('cached task launcher rejects an unidentified toolchain', () => {
  const result = spawnSync('node', [command, 'unidentified', '-e', 'process.exit(0)'])
  expect(result.status).toBe(2)
})

// Create a conflicting native binary in CWD: Windows bare-name process lookup
// searches it before PATH, whereas the runtime identity deliberately uses PATH.
test.skipIf(process.platform !== 'win32')(
  'Windows launcher uses the fingerprinted PATH binary over CWD',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'cortana-path-conflict-'))
    try {
      const bin = join(root, 'bin')
      const cwd = join(root, 'cwd')
      mkdirSync(bin)
      mkdirSync(cwd)
      const node = execFileSync('node', ['-p', 'process.execPath'], { encoding: 'utf8' }).trim()
      copyFileSync(process.execPath, join(bin, 'bun.exe'))
      copyFileSync(node, join(cwd, 'bun.exe'))
      const output = execFileSync(
        node,
        [
          command,
          'qualified-toolchain',
          '-e',
          'console.log(process.versions.bun ?? "wrong-node-binary")',
        ],
        {
          cwd,
          encoding: 'utf8',
          env: { ...process.env, PATH: [bin, process.env.PATH].join(delimiter) },
        }
      )
      expect(output.trim()).toBe(Bun.version)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
)
