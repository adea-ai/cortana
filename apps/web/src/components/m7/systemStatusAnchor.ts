/**
 * Anchor rect for the System status popover. When the bar wraps to a second row
 * (narrow window or enlarged text) a popover anchored to the trigger would open
 * over that row and hide the search field, so the anchor then extends down to
 * the bar's bottom edge. A single-row bar anchors to the trigger itself.
 *
 * The popover is anchored to the bar element (so its size changes re-position
 * the popover) and positions against the trigger's rect, which is why both are
 * passed in. A change to the bar alone, such as enlarged text, wraps the bar
 * without moving the trigger, and the popover only follows if the bar is the
 * element being observed.
 */
export function systemStatusAnchorRect(trigger?: HTMLElement, bar?: HTMLElement) {
  const rect = trigger?.getBoundingClientRect()
  if (!rect) return undefined
  const barRect = bar?.getBoundingClientRect()
  const height =
    barRect && barRect.bottom - rect.bottom >= 24 ? barRect.bottom - rect.y : rect.height
  return { x: rect.x, y: rect.y, width: rect.width, height }
}
