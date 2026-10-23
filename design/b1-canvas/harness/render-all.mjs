import { chromium } from '/home/user/cortana/node_modules/playwright/index.mjs'
import { readdirSync, writeFileSync } from 'node:fs'
const S = '/tmp/claude-0/-home-user/fc166f53-13cb-5efd-bbbd-0d37fe395dec/scratchpad'
const [dir, outDir, part, parts] = process.argv.slice(2)
const names = readdirSync(dir).filter(f => f.endsWith('.dc.html')).map(f => f.replace('.dc.html', '')).sort().filter((_, i) => i % +parts === +part)
const css = `@font-face{font-family:'Space Grotesk';src:url('file://${S}/dist/assets/space-grotesk-latin-wght-normal-BhU9QXUp.woff2');font-weight:300 700}`
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--allow-file-access-from-files'] })
const errs = {}
for (const n of names) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
  p.on('pageerror', (e) => { (errs[n] ??= []).push(e.message.slice(0, 160)) })
  try {
    await p.goto(`file://${dir}/${n}.dc.html`, { waitUntil: 'load', timeout: 20000 }); await p.addStyleTag({ content: css }); await p.waitForTimeout(900)
    await p.screenshot({ path: `${outDir}/${n}.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } })
  } catch (e) { (errs[n] ??= []).push('shot: ' + e.message.slice(0, 160)) }
  await p.close()
}
writeFileSync(`${outDir}/_errors-${part}.json`, JSON.stringify(errs, null, 1))
console.log('done part', part, names.length)
await b.close()
