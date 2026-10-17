import { expect, test } from 'bun:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

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
