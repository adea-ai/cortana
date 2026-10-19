import { describe, expect, test } from 'bun:test'

import { systemStatusAnchorRect } from './systemStatusAnchor'

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
  top: y,
  left: x,
  right: x + width,
  bottom: y + height,
})

function trigger(triggerRect: ReturnType<typeof rect>, barRect?: ReturnType<typeof rect>) {
  return {
    getBoundingClientRect: () => triggerRect,
    closest: (selector: string) =>
      selector === '[data-slot="top-bar"]' && barRect
        ? { getBoundingClientRect: () => barRect }
        : null,
  } as unknown as HTMLElement
}

describe('systemStatusAnchorRect', () => {
  test('keeps the trigger anchor on a single-row bar', () => {
    // 48px bar, 28px button centred: 10px below the button.
    expect(
      systemStatusAnchorRect(trigger(rect(250, 10, 28, 28), rect(0, 0, 320, 48)))
    ).toBeUndefined()
  })

  test('extends the anchor to the bar bottom when the bar wraps to a second row', () => {
    // 88px two-row bar: the popover must open below both rows.
    const anchor = systemStatusAnchorRect(trigger(rect(250, 10, 28, 28), rect(0, 0, 320, 88)))
    expect(anchor).toEqual({ x: 250, y: 10, width: 28, height: 78 })
    expect(anchor!.y + anchor!.height).toBe(88)
  })

  test('keeps the trigger anchor without a trigger or a bar', () => {
    expect(systemStatusAnchorRect(undefined)).toBeUndefined()
    expect(systemStatusAnchorRect(trigger(rect(250, 10, 28, 28)))).toBeUndefined()
  })
})
