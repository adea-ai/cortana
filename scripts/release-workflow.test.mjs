import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

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
const desktopConfigPath = fileURLToPath(
  new URL('../apps/desktop/src-tauri/tauri.conf.json', import.meta.url)
)
const desktopAppVersion = JSON.parse(readFileSync(desktopConfigPath, 'utf8')).version

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

test('dev release versions use the checked-out desktop source version', () => {
  const cutDevRelease = job(devBuildWorkflow, 'cut-dev-release')
  const checkout = cutDevRelease.indexOf('name: Check out the source version')
  const publish = cutDevRelease.indexOf('name: Publish the dev pre-release and start the build')

  assert.notEqual(checkout, -1)
  assert.ok(publish > checkout)
  assert.match(cutDevRelease, /ref: \$\{\{ github\.sha \}\}/)
  assert.ok(cutDevRelease.includes('apps/desktop/src-tauri/tauri.conf.json'))
  assert.match(cutDevRelease, /version="\$\{base\}-dev\.\$\{RUN_NUMBER\}"/)
  assert.doesNotMatch(cutDevRelease, /repos\/\$repo\/releases\/latest/)
  assert.doesNotMatch(cutDevRelease, /cat .*tauri\.conf\.json/)

  const versionAssignment = cutDevRelease.match(
    /base="\$\(\s*jq -er '([\s\S]*?)'\s+apps\/desktop\/src-tauri\/tauri\.conf\.json\s*\)"/
  )
  assert.ok(versionAssignment, 'dev base must be extracted from the desktop app config')
  const versionFilter = versionAssignment[1]
  const fromFixture = (version) =>
    execFileSync('jq', ['-er', versionFilter], {
      input: JSON.stringify({ version }),
      encoding: 'utf8',
    }).trim()

  assert.equal(fromFixture('0.66.1'), '0.66.1')
  assert.equal(fromFixture('0.80.0'), '0.80.0')
  for (const invalidVersion of ['0.66.1-dev.7', 'not-semver', '0.0.0']) {
    assert.throws(() => fromFixture(invalidVersion))
  }
  assert.throws(() => fromFixture(17))

  const extractedVersion = execFileSync('jq', ['-er', versionFilter, desktopConfigPath], {
    encoding: 'utf8',
  }).trim()
  assert.equal(extractedVersion, desktopAppVersion)
  assert.match(desktopAppVersion, /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/)
  assert.notEqual(desktopAppVersion, '0.0.0')
  assert.match(`v${desktopAppVersion}-dev.17`, /^v[0-9]+\.[0-9]+\.[0-9]+-dev\.17$/)
})

test('latest.json is verified against ready assets before publication', () => {
  const manifest = job(releaseAssetsWorkflow, 'manifest')
  const macosTrust = job(releaseAssetsWorkflow, 'macos_trust')
  const verify = job(releaseAssetsWorkflow, 'verify')

  assert.match(manifest, /needs: \[binaries, desktop, macos_trust\]/)
  assert.match(manifest, /needs\.binaries\.result == 'success'/)
  assert.match(manifest, /needs\.desktop\.result == 'success'/)
  assert.match(manifest, /needs\.macos_trust\.result == 'success'/)
  const generate = manifest.indexOf('name: Generate merged updater manifest')
  const strictCandidateCheck = manifest.indexOf(
    'name: Verify published assets and candidate updater manifest'
  )
  const upload = manifest.indexOf('name: Upload merged updater manifest')
  assert.ok(generate >= 0 && strictCandidateCheck > generate && upload > strictCandidateCheck)
  assert.match(manifest, /CORTANA_REQUIRE_MINISIGN: '1'/)
  assert.match(
    manifest,
    /verify-desktop-release\.sh "\$RELEASE_TAG"\s+--manifest-candidate "\$RUNNER_TEMP\/latest\.json"/
  )
  assert.doesNotMatch(manifest, /--allow-partial/)
  assert.match(verify, /needs: \[binaries, desktop, manifest, macos_trust\]/)
  assert.match(verify, /scripts\/verify-desktop-release\.sh "\$RELEASE_TAG"/)
  assert.doesNotMatch(verify, /--manifest-candidate/)
  assert.match(macosTrust, /needs: \[binaries, desktop\]/)
  assert.doesNotMatch(macosTrust, /needs: \[binaries, desktop, manifest\]/)
})
