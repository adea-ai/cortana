#!/usr/bin/env node

import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const dist = resolve(root, 'apps/web/dist')

export function assertWithinBudget(label, bytes, budget) {
  if (bytes > budget) {
    throw new Error(`${label} is ${bytes} bytes; budget is ${budget} bytes`)
  }
}

function size(path) {
  return statSync(resolve(dist, path)).size
}

function uniqueAssetBytes(manifest, keys) {
  const files = new Set([...keys].map((key) => manifest[key]?.file).filter(Boolean))
  return [...files].reduce((total, file) => total + size(file), 0)
}

function uniqueCssBytes(manifest, keys) {
  const files = new Set([...keys].flatMap((key) => manifest[key]?.css ?? []))
  return [...files].reduce((total, file) => total + size(file), 0)
}

export function staticImportKeys(manifest, roots) {
  const visited = new Set()
  const pending = [...roots]
  while (pending.length > 0) {
    const key = pending.pop()
    if (!key || visited.has(key) || !manifest[key]) continue
    visited.add(key)
    pending.push(...(manifest[key].imports ?? []))
  }
  return visited
}

export function verifyWebBundleBudget() {
  const manifest = JSON.parse(readFileSync(resolve(dist, '.vite/manifest.json'), 'utf8'))
  const entryKey = Object.entries(manifest).find(([, entry]) => entry.isEntry)?.[0]
  // App.tsx is statically imported by the entry so its module key may be
  // absent (folded into the entry chunk) rather than a lazy chunk of its own.
  const appKey = Object.keys(manifest).find(
    (key) => key.startsWith('_App-') || key.endsWith('/App.tsx') || key === 'src/App.tsx'
  )
  if (!entryKey) throw new Error('Vite manifest is missing the application entry')

  const initialKeys = staticImportKeys(manifest, appKey ? [entryKey, appKey] : [entryKey])
  const productionKeys = new Set(
    Object.keys(manifest).filter(
      (key) => key !== 'src/demoDesktop.ts' && manifest[key]?.file?.endsWith('.js')
    )
  )

  const measurements = [
    // The SolidJS audit moved Settings and the command palette out of the
    // eager graph (measured 409,960 bytes); the ceiling stays tight so a lazy
    // surface can never drift back into startup unnoticed.
    ['initial application JavaScript graph', uniqueAssetBytes(manifest, initialKeys), 500_000],
    // The complete shipped graph measures 727,009 bytes after the same audit.
    // Headroom covers near-term feature work while still bounding regressions.
    ['complete production JavaScript graph', uniqueAssetBytes(manifest, productionKeys), 850_000],
    // The knowledge graph, vault picker, and accessibility states extend the
    // shared stylesheet to 208,626 bytes in the audited build.
    ['application CSS graph', uniqueCssBytes(manifest, productionKeys), 220_000],
  ]

  for (const [label, bytes, budget] of measurements) {
    assertWithinBudget(label, bytes, budget)
    const headroom = budget - bytes
    const headroomPercent = ((headroom / budget) * 100).toFixed(1)
    console.log(
      `${label}: ${bytes}/${budget} bytes — headroom ${headroom} bytes (${headroomPercent}%)`
    )
  }
}

if (import.meta.main) verifyWebBundleBudget()
