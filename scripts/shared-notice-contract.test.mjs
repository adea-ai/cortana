import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const notice = readFileSync(resolve(root, 'NOTICE'), 'utf8')
for (const [name, publishedNotice] of [
  ['ui', 'dist/NOTICE'],
  ['themes', 'NOTICE'],
]) {
  test(`reproduces the actual published ${name} notice and version`, () => {
    const directory = resolve(root, `apps/web/node_modules/@adea-ai/${name}`)
    const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'))
    expect(notice).toContain(`@adea-ai/${name} ${manifest.version}`)
    expect(notice).toContain(readFileSync(resolve(directory, publishedNotice), 'utf8').trim())
  })
}
