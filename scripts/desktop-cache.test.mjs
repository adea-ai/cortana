import assert from 'node:assert/strict'
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  renameSync,
  globSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
import test from 'node:test'
import { createHash } from 'node:crypto'

const workflow = readFileSync(new URL('../.github/workflows/desktop.yml', import.meta.url), 'utf8')
const releaseAssetsWorkflow = readFileSync(
  new URL('../.github/workflows/release-assets.yml', import.meta.url),
  'utf8'
)
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
      '${{ runner.os }}-${{ runner.arch }}-ubuntu-24.04-${{ env.CORTANA_DESKTOP_TARGET }}-desktop-rust-v3-debug-release-${{ github.job }}-'
    assert.ok(key(id).startsWith(prefix), key(id))
    assert.match(job(id), /runs-on: ubuntu-24\.04\n/)
    assert.match(key(id), /hashFiles\('rust-toolchain.toml', '\.mise.toml', '\.cargo\/config\*'/)
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
  assert.match(detector, /\.github\/workflows\/release-assets\.yml/)
  assert.match(detector, /\.github\/workflows\/dev-build\.yml/)
  assert.match(detector, /scripts\/release-workflow\.test\.mjs/)
})

test('Windows release asset builds run the dev version override script in Bash', () => {
  const desktopStart = releaseAssetsWorkflow.indexOf('\n  desktop:\n')
  assert.notEqual(desktopStart, -1, 'missing Desktop release-assets job')
  const desktopTail = releaseAssetsWorkflow.slice(desktopStart + 1)
  const desktopEnd = desktopTail.slice(1).search(/\n  [A-Za-z_][A-Za-z0-9_-]*:\n/)
  const desktopJob = desktopEnd === -1 ? desktopTail : desktopTail.slice(0, desktopEnd + 1)
  const overrideStart = desktopJob.indexOf('      - name: Apply the dev version override\n')
  assert.notEqual(overrideStart, -1, 'missing dev version override step')
  const overrideTail = desktopJob.slice(overrideStart)
  const overrideEnd = overrideTail.indexOf('\n      - name: ', 1)
  const overrideStep = overrideEnd === -1 ? overrideTail : overrideTail.slice(0, overrideEnd)
  assert.match(overrideStep, /\n        shell: bash\n/)
  assert.match(overrideStep, /set -euo pipefail/)
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

const sccacheJobs = ['gtk_iterator', 'desktop_test', 'desktop_clippy', 'release']

test('every compiling desktop job wraps rustc with the shared sccache action', () => {
  for (const id of sccacheJobs) {
    const source = job(id)
    assert.match(source, /uses: \.\/\.github\/actions\/desktop-sccache\n/, id)
    // The wrap must come after the target cache step so restore happens first.
    assert.ok(
      source.indexOf('- name: Cache Rust build artifacts') < source.indexOf('desktop-sccache'),
      `${id} must wrap rustc after its target cache step`
    )
  }
})

test('non-compiling desktop jobs never initialize sccache', () => {
  assert.doesNotMatch(job('gtk_provenance'), /desktop-sccache/)
  assert.doesNotMatch(job('security_audit'), /desktop-sccache/)
})

test('the sccache action caches only its content-addressed store', () => {
  const action = readFileSync(
    new URL('../.github/actions/desktop-sccache/action.yml', import.meta.url),
    'utf8'
  )
  assert.match(action, /actions\/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9/)
  assert.match(action, /taiki-e\/install-action@1e29709c0ec63babbe8f266397a465f29a825f91/)
  assert.match(action, /path: ~\/\.cache\/sccache\n/)
  assert.match(action, /RUSTC_WRAPPER=sccache/)
  // Primary key stays per-job; restore shares objects across desktop jobs.
  assert.match(action, /desktop-sccache-v2-\$\{\{ github\.job \}\}/)
  assert.match(action, /desktop-sccache-v2-\n/)
  assert.doesNotMatch(action, /github\.(sha|run_id|run_attempt)/)
})

test('desktop change detection covers the sccache action', () => {
  const detector = workflow.slice(
    workflow.indexOf('is_desktop_path()'),
    workflow.indexOf('changed=false')
  )
  assert.match(detector, /\.github\/actions\/desktop-sccache\//)
})

// Execute the actual workflow function, rather than a second classifier.
function requiresDesktop(changedPaths) {
  const detector = workflow.slice(
    workflow.indexOf('          is_desktop_path()'),
    workflow.indexOf('          # Materialize the diff')
  )
  const result = spawnSync(
    'bash',
    [
      '-euo',
      'pipefail',
      '-c',
      `${detector}
for path in "$@"; do
  if is_desktop_path "$path"; then echo true; exit 0; fi
done
echo false`,
      'desktop-input-test',
      ...changedPaths,
    ],
    { encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim() === 'true'
}

test('PR2609 keyboard tests and visual evidence do not require native compilation', () => {
  assert.equal(
    requiresDesktop([
      'apps/web/src/components/m7/M7ApplicationHeader.test.tsx',
      'docs/verification/issue-2568-topbar-keyboard-order/keyboard-order.md',
      'docs/verification/issue-2568-topbar-keyboard-order/header-keyboard-order-320-100.png',
      'scripts/capture-m7-visuals.mjs',
    ]),
    false
  )
})

test('renderer test-only changes stay in Code Foundry validation', () => {
  for (const path of ['apps/web/src/contracts.test.ts', 'apps/web/src/nested/component.test.tsx']) {
    assert.equal(requiresDesktop([path]), false, path)
  }
})

test('native, shared ABI, renderer production and transitive build inputs retain full desktop qualification', () => {
  for (const path of [
    'src/main.rs',
    'crates/core/src/config.rs',
    'src/cortana/cli.py',
    'apps/desktop/src-tauri/src/lib.rs',
    'apps/desktop/src-tauri/build.rs',
    'apps/desktop/src-tauri/capabilities/desktop-owner.json',
    'apps/web/src/api.ts',
    'apps/web/src/components/m7/M7ApplicationHeader.tsx',
    'apps/web/tooling/generate-ui-tailwind-sources.ts',
    'apps/web/vite.config.ts',
    'apps/web/public/icon.png',
    'apps/web/package.json',
    'apps/web/tsconfig.json',
    'Cargo.toml',
    'Cargo.lock',
    'crates/core/Cargo.toml',
    'bun.lock',
    'package.json',
    'rust-toolchain.toml',
    '.mise.toml',
    '.cargo/config.toml',
    'apps/desktop/src-tauri/.cargo/config.toml',
    'pyproject.toml',
    'uv.lock',
    'README.md',
    'LICENSE',
    'third_party/tauri-plugin-updater-2.10.1/src/lib.rs',
    'scripts/desktop-lockfile.mjs',
    'scripts/run-desktop-command.mjs',
    '.github/code-foundry.yml',
    '.github/workflows/desktop.yml',
  ]) {
    assert.equal(requiresDesktop([path]), true, path)
    assert.equal(requiresDesktop(['apps/web/src/contracts.test.ts', path]), true, `mixed: ${path}`)
  }
})

test('source changes refresh immutable target caches without crossing lockfiles or profiles', () => {
  for (const id of cacheJobs) {
    assert.match(key(id), /hashFiles\('src\/\*\*\/\*.rs'/)
    const restore = cache(id).split('          restore-keys: |\n')[1].trim().split('\n')[0]
    assert.ok(restore.includes("hashFiles('Cargo.toml', 'Cargo.lock'"), restore)
    assert.ok(restore.includes("hashFiles('apps/desktop/src-tauri/Cargo.lock')"), restore)
    assert.ok(restore.includes('debug-release'), restore)
    assert.ok(
      key(id).startsWith(restore),
      'restore is the exact build identity minus source fingerprint'
    )
  }
})

test('selected desktop audits reject unexpected skipped jobs', () => {
  const aggregate = job('aggregate')
  const step = aggregate.slice(
    aggregate.indexOf('      - name: Require all selected desktop jobs to succeed')
  )
  assert.match(step, /needs\.changes\.outputs\.desktop == 'true'/)
  assert.match(step, /JOB_RESULTS: \$\{\{ join\(needs\.\*\.result, ' '\) \}\}/)
  const run = step.split('        run: |\n')[1].split('      - name:')[0]
  for (const results of [
    'success success success',
    'success skipped success',
    'failure success',
    'cancelled success',
  ]) {
    const result = spawnSync('bash', ['-euo', 'pipefail', '-c', run], {
      env: { ...process.env, JOB_RESULTS: results },
    })
    assert.equal(result.status === 0, results === 'success success success', results)
  }
})

test('Code Foundry retains web validation and includes vendored and toolchain inputs', async () => {
  const { readTaskFilters, taskAffected } =
    await import('../node_modules/code-foundry/src/lib/task-filters.mjs')
  const config = Object.fromEntries(
    readFileSync(new URL('../.github/code-foundry.yml', import.meta.url), 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('filter_'))
      .map((line) => {
        const index = line.indexOf(':')
        return [
          line.slice(0, index),
          line
            .slice(index + 1)
            .trim()
            .replace(/^'|'$/g, ''),
        ]
      })
  )
  const filters = readTaskFilters(config)
  for (const lane of ['integration', 'e2e', 'performance']) {
    for (const path of [
      'apps/web/src/components/m7/M7ApplicationHeader.test.tsx',
      'crates/core/src/config.rs',
      'third_party/glib-0.18.5/src/lib.rs',
      'third_party/tauri-plugin-updater-2.10.1/src/lib.rs',
      '.cargo/config.toml',
      '.mise.toml',
      'rust-toolchain.toml',
      'vite.config.ts',
      'tsconfig.tooling.json',
      '.npmrc',
      'bun.lock',
      'Cargo.lock',
    ]) {
      assert.equal(taskAffected(lane, filters, [path]), true, `${lane}: ${path}`)
    }
    assert.equal(taskAffected(lane, filters, ['docs/verification/keyboard-order.md']), false)
    assert.equal(taskAffected(lane, filters, null), true, 'unresolved changes must run validation')
  }
  for (const lane of ['format', 'lint', 'type_check', 'build', 'unit']) {
    assert.equal(filters.has(lane), false, `${lane} retains full coverage`)
  }
})

test('actual Git diffs preserve native validation across renames, deletions and unusual filenames', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-inputs-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim()
  const write = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  git('init', '-q')
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.com',
    'commit',
    '--allow-empty',
    '-qm',
    'base'
  )
  const empty = git('rev-parse', 'HEAD')
  const run = (base, head, event = 'pull_request') => {
    const output = join(root, 'output')
    writeFileSync(output, '')
    const script = job('changes').split('        run: |\n')[1]
    const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
      cwd: root,
      env: {
        ...process.env,
        BASE_SHA: base,
        HEAD_SHA: head,
        EVENT_NAME: event,
        GITHUB_OUTPUT: output,
      },
      encoding: 'utf8',
    })
    return { status: result.status, output: readFileSync(output, 'utf8') }
  }
  write('apps/web/src/Header.test.tsx', '// test only')
  git('add', 'apps')
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.com',
    'commit',
    '-qm',
    'renderer test'
  )
  const testOnly = git('rev-parse', 'HEAD')
  assert.deepEqual(run(empty, testOnly), { status: 0, output: 'desktop=false\n' })
  write('apps/web/src/native\nbridge.ts', '// production bridge')
  git('add', 'apps')
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-qm', 'bridge')
  const native = git('rev-parse', 'HEAD')
  assert.deepEqual(run(testOnly, native), { status: 0, output: 'desktop=true\n' })
  renameSync(
    join(root, 'apps/web/src/native\nbridge.ts'),
    join(root, 'apps/web/src/Bridge.test.ts')
  )
  git('add', 'apps')
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.com',
    'commit',
    '-qm',
    'rename production into test'
  )
  assert.deepEqual(run(native, 'HEAD'), { status: 0, output: 'desktop=true\n' })
  const invalid = run('missing-base', 'HEAD')
  assert.notEqual(invalid.status, 0)
  assert.equal(invalid.output, '')
  assert.deepEqual(run('', '', 'workflow_dispatch'), { status: 0, output: 'desktop=true\n' })
})

test('cache identities change for lockfiles and toolchains while source edits reuse only compatible targets', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-cache-key-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), value)
  }
  const evaluate = (expression) =>
    expression.replace(/\$\{\{ hashFiles\((.*?)\) \}\}/g, (_, args) => {
      const patterns = [...args.matchAll(/'([^']+)'/g)].map((match) => match[1])
      const files = [...globSync(patterns, { cwd: root })].toSorted()
      const digest = createHash('sha256')
      for (const path of files) digest.update(readFileSync(join(root, path)))
      return files.length ? digest.digest('hex') : ''
    })
  for (const path of [
    'Cargo.lock',
    'Cargo.toml',
    'apps/desktop/src-tauri/Cargo.lock',
    'crates/core/Cargo.toml',
    'rust-toolchain.toml',
    'crates/core/src/abi.rs',
  ])
    write(path, 'initial')
  const primary = key('release')
  const fallback = cache('release').split('          restore-keys: |\n')[1].trim().split('\n')[0]
  const before = evaluate(primary)
  const compatible = evaluate(fallback)
  write('crates/core/src/abi.rs', 'changed ABI')
  assert.notEqual(evaluate(primary), before)
  assert.equal(evaluate(fallback), compatible)
  assert.ok(evaluate(primary).startsWith(compatible))
  for (const path of [
    'Cargo.lock',
    'apps/desktop/src-tauri/Cargo.lock',
    'crates/core/Cargo.toml',
    'rust-toolchain.toml',
  ]) {
    write(path, 'changed')
    assert.notEqual(evaluate(fallback), compatible, path)
    write(path, 'initial')
  }
  assert.ok(evaluate(primary).length < 512, 'GitHub cache key limit')
})
