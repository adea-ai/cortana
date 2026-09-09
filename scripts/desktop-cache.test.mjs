import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workflow = readFileSync(new URL('../.github/workflows/desktop.yml', import.meta.url), 'utf8')
const jobs = [
  'gtk_provenance',
  'gtk_iterator',
  'security_audit',
  'desktop_test',
  'desktop_clippy',
  'release',
]
const cacheJobs = jobs.filter((id) => id !== 'gtk_provenance')

function job(id) {
  const start = workflow.indexOf(`\n  ${id}:`)
  assert.notEqual(start, -1, `missing job ${id}`)
  const tail = workflow.slice(start + 1)
  const end = tail.slice(1).search(/\n  [A-Za-z_][A-Za-z0-9_-]*:\n/)
  return end === -1 ? tail : tail.slice(0, end + 1)
}

function cache(id) {
  const source = job(id)
  const start = source.indexOf('      - name: Cache Rust build artifacts\n')
  assert.notEqual(start, -1, `missing Rust cache in ${id}`)
  const tail = source.slice(start)
  const end = tail.indexOf('\n      - name: ', 1)
  return end === -1 ? tail : tail.slice(0, end)
}

function paths(id) {
  const content = cache(id).split('          path: |\n')[1].split('          key:')[0]
  return content
    .trim()
    .split('\n')
    .map((line) => line.trim())
}

function key(id) {
  const content = cache(id)
  return content.split('          key: >-\n')[1].split('\n')[0].trim()
}

for (const id of cacheJobs) {
  test(`${id} isolates its Rust cache by workload, platform and toolchain`, () => {
    const source = cache(id)
    assert.match(source, /actions\/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9/)
    const prefix =
      '${{ runner.os }}-${{ runner.arch }}-ubuntu-24.04-${{ env.CORTANA_DESKTOP_TARGET }}-desktop-rust-v2-${{ github.job }}-'
    assert.ok(key(id).startsWith(prefix), key(id))
    assert.match(job(id), /runs-on: ubuntu-24\.04\n/)
    assert.match(key(id), /hashFiles\('rust-toolchain.toml', '\.cargo\/config\*'/)
    assert.match(key(id), /hashFiles\('Cargo.toml', 'Cargo.lock'/)
    assert.match(key(id), /hashFiles\('apps\/desktop\/src-tauri\/Cargo.lock'\)/)
    assert.match(key(id), /hashFiles\('third_party\/glib-0.18.5\/Cargo.toml'\)/)
    const restore = source
      .split('          restore-keys: |\n')[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
    assert.equal(restore.length, 1, 'only the same-workload/toolchain restore prefix is allowed')
    assert.ok(restore[0].startsWith(prefix), restore[0])
    assert.match(restore[0], /hashFiles\('rust-toolchain.toml'/)
    assert.doesNotMatch(key(id), /github\.(sha|run_id|run_attempt)/)
  })
}

test("parallel metadata jobs cannot reserve another job's immutable cache key", () => {
  const resolved = cacheJobs.map((id) => key(id).replaceAll('${{ github.job }}', id))
  assert.equal(new Set(resolved).size, cacheJobs.length)
})

test('GTK provenance does not initialize an unused Rust cache', () => {
  assert.doesNotMatch(job('gtk_provenance'), /Cache Rust build artifacts/)
})

test('desktop cache regression coverage is included in desktop change detection', () => {
  const detector = workflow.slice(
    workflow.indexOf('is_desktop_path()'),
    workflow.indexOf('changed=false')
  )
  assert.match(detector, /scripts\/desktop-cache\.test\.mjs/)
})

test('dependency audit never transfers compilation targets', () => {
  assert.deepEqual(paths('security_audit'), ['~/.cargo/registry', '~/.cargo/git'])
})

test('GTK iterator caches only its own standalone target directory', () => {
  assert.deepEqual(paths('gtk_iterator'), [
    '~/.cargo/registry',
    '~/.cargo/git',
    'third_party/glib-0.18.5/target',
  ])
})

test('desktop checks retain root sidecar and Tauri compiler outputs', () => {
  for (const id of ['desktop_test', 'desktop_clippy', 'release']) {
    assert.deepEqual(paths(id), [
      '~/.cargo/registry',
      '~/.cargo/git',
      'target',
      'apps/desktop/src-tauri/target',
    ])
  }
})

test('all six checks stay independent and the aggregate still gates every one', () => {
  for (const id of jobs) {
    const header = job(id).split('    steps:')[0]
    assert.match(header, /needs: changes\n/)
    assert.match(header, /needs\.changes\.outputs\.desktop == 'true'/)
    assert.match(header, /github\.event_name == 'workflow_dispatch'/)
    assert.match(header, /github\.event\.pull_request\.base\.ref == 'main'/)
    assert.match(
      header,
      /!startsWith\(github.event.pull_request.head.ref, 'release-please--branches--main'\)/
    )
    assert.doesNotMatch(header, /continue-on-error/)
  }
  assert.match(workflow, /^env:\n  CORTANA_DESKTOP_TARGET: x86_64-unknown-linux-gnu$/m)
  const aggregate = job('aggregate')
  assert.match(aggregate, /name: Tauri 2 \/ Linux/)
  const aggregateNeeds = aggregate.slice(
    aggregate.indexOf('    needs:\n'),
    aggregate.indexOf('    if:')
  )
  for (const id of jobs) {
    assert.match(aggregateNeeds, new RegExp(`\\b${id}\\b`))
    assert.ok(aggregate.includes(`needs.${id}.result == 'failure'`))
    assert.ok(aggregate.includes(`needs.${id}.result == 'cancelled'`))
  }
  assert.match(job('release'), /run: bun run desktop:build/)
  assert.match(job('desktop_test'), /run: bun run desktop:test/)
  assert.match(job('desktop_clippy'), /run: bun run --cwd apps\/desktop clippy/)
  assert.match(
    job('gtk_iterator'),
    /cargo test --manifest-path third_party\/glib-0.18.5\/Cargo.toml --release --lib variant_iter/
  )
  assert.doesNotMatch(workflow, /CARGO_PROFILE_|CARGO_BUILD_JOBS|pull_request_target:/)
})

test('pinned cargo-audit binary reuse stays separate from compiler caches', () => {
  const source = job('security_audit')
  assert.match(source, /path: ~\/\.cargo\/bin\/cargo-audit/)
  assert.ok(source.includes('${{ runner.os }}-${{ runner.arch }}-cargo-audit-0.22.2'))
  assert.match(source, /if: steps.cache-cargo-audit.outputs.cache-hit != 'true'/)
  assert.match(source, /cargo install cargo-audit --version 0.22.2 --locked/)
})
