import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const devBuildWorkflow = readFileSync(
  new URL('../.github/workflows/dev-build.yml', import.meta.url),
  'utf8'
)
const releaseAssetsWorkflow = readFileSync(
  new URL('../.github/workflows/release-assets.yml', import.meta.url),
  'utf8'
)
const desktopWorkflow = readFileSync(
  new URL('../.github/workflows/desktop.yml', import.meta.url),
  'utf8'
)
const versionGuardWorkflow = readFileSync(
  new URL('../.github/workflows/release-version-guard.yml', import.meta.url),
  'utf8'
)

function job(source, id) {
  const start = source.indexOf(`\n  ${id}:`)
  assert.notEqual(start, -1, `missing job ${id}`)
  const tail = source.slice(start + 1)
  const end = tail.slice(1).search(/\n  [A-Za-z_][A-Za-z0-9_-]*:\n/)
  return end === -1 ? tail : tail.slice(0, end + 1)
}

for (const [name, source, entryJob] of [
  ['desktop', desktopWorkflow, 'changes'],
  ['version guard', versionGuardWorkflow, 'release-version-guard'],
]) {
  test(`${name} checks rerun for new commits on ready PRs without allocating draft runners`, () => {
    const events = source.slice(
      source.indexOf('\n  pull_request:'),
      source.indexOf('\n  workflow_dispatch:')
    )
    assert.match(events, /ready_for_review/)
    assert.match(events, /synchronize/)
    assert.match(
      job(source, entryJob),
      /if: github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.draft == false/
    )
  })
}

test('rerunning a dev build republishes assets for its existing tag', () => {
  const cutDevRelease = job(devBuildWorkflow, 'cut-dev-release')

  assert.match(cutDevRelease, /if gh release view "\$tag" --repo "\$repo"/)
  assert.match(cutDevRelease, /already exists; retrying asset publication/)
  assert.match(cutDevRelease, /gh release create "\$tag"[\s\S]*?--prerelease --target "\$SHA"/)
  assert.match(cutDevRelease, /gh release view "\$tag" --repo "\$repo" --json isPrerelease/)
  assert.match(
    cutDevRelease,
    /gh workflow run release-assets\.yml[\s\S]*?-f tag="\$tag" -f version_override="\$version"/
  )
  assert.doesNotMatch(cutDevRelease, /already exists; nothing to do/)
})

test('latest.json is published only after every platform and trust check succeeds', () => {
  const manifest = job(releaseAssetsWorkflow, 'manifest')
  const macosTrust = job(releaseAssetsWorkflow, 'macos_trust')

  assert.match(manifest, /needs: \[binaries, desktop, macos_trust\]/)
  assert.match(manifest, /needs\.binaries\.result == 'success'/)
  assert.match(manifest, /needs\.desktop\.result == 'success'/)
  assert.match(manifest, /needs\.macos_trust\.result == 'success'/)
  assert.doesNotMatch(manifest, /--allow-partial/)
  assert.match(macosTrust, /needs: \[binaries, desktop\]/)
  assert.doesNotMatch(macosTrust, /needs: \[binaries, desktop, manifest\]/)
})
