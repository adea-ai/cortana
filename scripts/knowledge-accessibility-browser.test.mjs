import { expect, test } from 'bun:test'

import {
  setViewportAndWaitForLayout,
  waitForInitialKeyboardTarget,
  waitForTransitionStylesToSettle,
} from './knowledge-accessibility-browser.mjs'

function relativeLuminance(hex) {
  const [red, green, blue] = hex
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

test('waits for the rendered skip link before the initial keyboard check', async () => {
  const calls = []
  const skipLink = { waitFor: async (options) => calls.push(options) }
  const page = {
    locator(selector) {
      calls.push(selector)
      return skipLink
    },
  }

  expect(await waitForInitialKeyboardTarget(page)).toBe(skipLink)
  expect(calls).toEqual(['a[href="#main-content"]', { state: 'visible' }])
})

test('waits for the browser layout after changing viewport dimensions', async () => {
  const calls = []
  const page = {
    setViewportSize: async (viewport) => calls.push(['setViewportSize', viewport]),
    evaluate: async (callback) => {
      calls.push(['evaluate', typeof callback])
      return callback
    },
  }

  await setViewportAndWaitForLayout(page, { width: 768, height: 1024 })

  expect(calls).toEqual([
    ['setViewportSize', { width: 768, height: 1024 }],
    ['evaluate', 'function'],
  ])
})

test('waits through a selected-control color transition before accessibility sampling', async () => {
  let frame = 0
  const samples = []
  const runningTransition = { playState: 'running' }
  const intermediate = { foreground: '#d8dee9', background: '#90b1d1' }
  const final = { foreground: '#2e3440', background: '#90b1d1' }

  await waitForTransitionStylesToSettle({}, 100, {
    now: () => frame * 16,
    nextFrame: async () => {
      frame += 1
    },
    // The transition is still unregistered after the first completed frame.
    // It then remains active until the final colors have been applied.
    getAnimations: () => (frame < 2 ? [] : frame < 4 ? [runningTransition] : []),
    flushStyles: () => samples.push(frame < 4 ? intermediate : final),
  })

  expect(samples).toContainEqual(intermediate)
  expect(samples.at(-1)).toEqual(final)
  expect(contrastRatio(intermediate.foreground, intermediate.background)).toBeLessThan(4.5)
  expect(contrastRatio(final.foreground, final.background)).toBeGreaterThanOrEqual(4.5)
  expect(frame).toBeGreaterThanOrEqual(5)
})

test('fails when a control transition does not settle before the bounded timeout', async () => {
  let frame = 0

  await expect(
    waitForTransitionStylesToSettle({}, 32, {
      now: () => frame * 16,
      nextFrame: async () => {
        frame += 1
      },
      getAnimations: () => [{ playState: 'running' }],
      flushStyles: () => {},
    })
  ).rejects.toThrow('Control color transitions did not settle within 32ms')
})
