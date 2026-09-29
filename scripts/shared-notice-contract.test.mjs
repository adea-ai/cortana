import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'

const root = resolve(import.meta.dir, '..')
const notice = readFileSync(resolve(root, 'NOTICE'), 'utf8')
for (const [name, publishedNotice] of [
  ['ui', 'dist/NOTICE'],
  ['themes', 'NOTICE'],
]) {
  test(`reproduces the actual published ${name} notice and version`, () => {
    // Resolve through the app's module graph rather than a node_modules path:
    // bun's isolated install links packages per platform, so the physical
    // location differs between checkouts.
    const requireFromWeb = createRequire(resolve(root, 'apps/web/package.json'))
    const directory = dirname(requireFromWeb.resolve(`@adea-ai/${name}/package.json`))
    const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'))
    expect(notice).toContain(`@adea-ai/${name} ${manifest.version}`)
    expect(notice).toContain(readFileSync(resolve(directory, publishedNotice), 'utf8').trim())
  })
}
