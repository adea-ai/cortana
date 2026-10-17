import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

for (const name of ['m7-visual-evidence', 'knowledge-accessibility', 'desktop-acceptance']) {
  test(`${name} restores package downloads before install and has a reachable trusted default-branch writer`, () => {
    const source = readFileSync(
      new URL(`../.github/workflows/${name}.yml`, import.meta.url),
      'utf8'
    )
    const start = source.indexOf('      - name: Restore Bun package downloads\n')
    assert.ok(start >= 0)
    const install = source.indexOf('run: bun install --frozen-lockfile', start)
    const save = source.indexOf('      - name: Save Bun package downloads\n', start)
    assert.ok(install > start && save > install)
    const end = source.indexOf('\n      - name:', save + 1)
    const cache = source.slice(start, end === -1 ? undefined : end)
    assert.match(cache, /actions\/cache\/restore@[a-f0-9]{40}/)
    assert.match(cache, /actions\/cache\/save@[a-f0-9]{40}/)
    assert.equal((cache.match(/path: ~\/\.bun\/install\/cache/g) ?? []).length, 2)
    assert.doesNotMatch(cache, /node_modules/)
    assert.match(cache, /runner\.os.*runner\.arch.*1\.4\.3.*hashFiles\('bun\.lock'\)/)
    const event = name === 'desktop-acceptance' ? 'workflow_dispatch' : 'push'
    assert.ok(source.slice(0, source.indexOf('\njobs:')).includes(`${event}:`))
    assert.ok(cache.includes(`github.event_name == '${event}'`))
    if (name === 'desktop-acceptance') {
      assert.doesNotMatch(source.slice(0, source.indexOf('\npermissions:')), /\n  push:/)
      assert.doesNotMatch(cache, /github\.event_name == 'push'/)
      for (const platform of ['macos-14', 'ubuntu-24.04', 'windows-latest'])
        assert.ok(source.includes(`runner: ${platform}`))
    }
    assert.match(
      cache,
      /github\.ref == format\('refs\/heads\/\{0\}', github\.event\.repository\.default_branch\)/
    )
    assert.match(cache, /steps\.bun-downloads\.outputs\.cache-hit != 'true'/)
    assert.match(cache, /key: \$\{\{ steps\.bun-downloads\.outputs\.cache-primary-key \}\}/)
  })
}
