#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const crate = resolve(root, 'third_party/tauri-plugin-updater-2.10.1')
const lockfile = resolve(root, 'apps/desktop/src-tauri/Cargo.lock')

// Files that must stay byte-identical to the published 2.10.1 archive
// (sha256 806d9dac662c2e4594ff03c647a552f2c9bd544e7d0f683ec58f872f952ce4af).
const published = {
  'Cargo.toml.orig': '3900e6edcbe827273b2031c3528aba48ae7055bf536abfa25662b7c02409ea89',
  'build.rs': '9cfd08999145a5d82ac206a6e244278fc39aeca45d874ec42474b49d504fe192',
  'src/config.rs': '71cfb43fd484a218422cccb89056bfd32236104f2ba5a2d937d337078cf60f45',
  'src/error.rs': 'bd2504aca0b86c0e157d846fd72f110216617f2af29551f245f38b42a1a9884c',
  'src/lib.rs': 'dd914a66c150f3bb6f5e8e8bbdc46b1ded00bda351279ecfe1e55491ff429351',
  'src/updater.rs': 'd754b8887ad79c5155e4186e758529b320f4a404cbe5c32247e62f33e1fe5a05',
}
for (const [file, expected] of Object.entries(published)) {
  verifyHash(resolve(crate, file), expected)
}
// The one reviewed delta: the Windows zip requirement moves from 4 to 9.
verifyHash(
  resolve(crate, 'Cargo.toml'),
  'fab5b208d0426f713a0e54dc5b6188199b9e8fa10bbac571851037860952a31b'
)

const manifest = readFileSync(resolve(crate, 'Cargo.toml'), 'utf8')
if (
  !/^name = "tauri-plugin-updater"$/m.test(manifest) ||
  !/^version = "2\.10\.1"$/m.test(manifest) ||
  !/^\[target\.'cfg\(target_os = "windows"\)'\.dependencies\.zip\]\nversion = "9"$/m.test(manifest)
) {
  throw new Error('vendored tauri-plugin-updater no longer carries the reviewed zip 9 backport')
}

const lock = readFileSync(lockfile, 'utf8')
const entry = (name) => [
  ...lock.matchAll(
    new RegExp(`\\[\\[package\\]\\]\\nname = "${name}"\\nversion = "([^"]+)"\\n([^\\n]*)`, 'g')
  ),
]
if (!entry('zip').length || entry('zip').some(([, version]) => !version.startsWith('9.'))) {
  throw new Error('apps/desktop/src-tauri/Cargo.lock must resolve zip 9 only')
}
const updater = entry('tauri-plugin-updater')
if (updater.length !== 1 || updater[0][1] !== '2.10.1' || updater[0][2].startsWith('source =')) {
  throw new Error(
    'apps/desktop/src-tauri/Cargo.lock must resolve tauri-plugin-updater to the vendored path crate'
  )
}

console.log('Verified vendored tauri-plugin-updater 2.10.1 zip 9 backport')

function verifyHash(path, expected) {
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex')
  if (actual !== expected) {
    throw new Error(`${path} hash mismatch: expected ${expected}, got ${actual}`)
  }
}
