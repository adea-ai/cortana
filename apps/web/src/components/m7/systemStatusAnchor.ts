/**
 * Anchor rect for the System status popover. When the bar wraps to a second row
 * (narrow window or enlarged text) a popover anchored to the trigger would open
 * over that row and hide the search field, so the anchor then extends down to
 * the bar's bottom edge. A single-row bar returns undefined and keeps the
 * trigger as the anchor.
 */
export function systemStatusAnchorRect(trigger?: HTMLElement) {
  const rect = trigger?.getBoundingClientRect()
  const bar = trigger?.closest('[data-slot="top-bar"]')?.getBoundingClientRect()
  if (!rect || !bar || bar.bottom - rect.bottom < 24) return undefined
  return { x: rect.x, y: rect.y, width: rect.width, height: bar.bottom - rect.y }
}
