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

const element = (elementRect: ReturnType<typeof rect>) =>
  ({ getBoundingClientRect: () => elementRect }) as unknown as HTMLElement

describe('systemStatusAnchorRect', () => {
  test('anchors to the trigger on a single-row bar', () => {
    // 48px bar, 28px button centred: 10px below the button.
    expect(
      systemStatusAnchorRect(element(rect(250, 10, 28, 28)), element(rect(0, 0, 320, 48)))
    ).toEqual({ x: 250, y: 10, width: 28, height: 28 })
  })

  test('extends the anchor to the bar bottom when the bar wraps to a second row', () => {
    // 88px two-row bar: the popover must open below both rows.
    const anchor = systemStatusAnchorRect(
      element(rect(250, 10, 28, 28)),
      element(rect(0, 0, 320, 88))
    )
    expect(anchor).toEqual({ x: 250, y: 10, width: 28, height: 78 })
    expect(anchor!.y + anchor!.height).toBe(88)
  })

  test('follows the same bar element from wrapped back to single-row', () => {
    const trigger = element(rect(250, 10, 28, 28))
    let bar = rect(0, 0, 320, 88)
    const barElement = { getBoundingClientRect: () => bar } as unknown as HTMLElement
    expect(systemStatusAnchorRect(trigger, barElement)!.height).toBe(78)
    bar = rect(0, 0, 320, 48)
    expect(systemStatusAnchorRect(trigger, barElement)!.height).toBe(28)
  })

  test('anchors to the trigger without a bar, and to nothing without a trigger', () => {
    expect(systemStatusAnchorRect(element(rect(250, 10, 28, 28)))).toEqual({
      x: 250,
      y: 10,
      width: 28,
      height: 28,
    })
    expect(systemStatusAnchorRect(undefined, element(rect(0, 0, 320, 88)))).toBeUndefined()
  })
})
