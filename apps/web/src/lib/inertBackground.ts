// Kobalte hides background content with aria-hidden while a modal overlay is
// open. Screen readers honor the marker, but the hidden elements stay
// technically focusable and accessibility audits flag them. `inert` carries
// the same semantics and additionally removes the subtree from sequential
// focus, so translate the marker on the application root while a modal
// overlay is open.
//
// Overlay detection only considers siblings of the app root: portaled
// surfaces land there, while in-page roles like the document listbox or
// source tree always live inside the root. Surfaces marked data-closed are
// exiting and no longer count: keeping the background inert during the exit
// window would swallow Kobalte's focus restoration back into the page.
const OVERLAY_ROLES = '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]'
const CLOSED_OVERLAY = '[data-closed],[hidden]'

function openOverlaySiblings(root: HTMLElement) {
  for (const sibling of document.body.children) {
    if (sibling === root) continue
    const overlay =
      sibling instanceof HTMLElement && sibling.matches(OVERLAY_ROLES)
        ? sibling
        : sibling.querySelector?.(OVERLAY_ROLES)
    if (overlay instanceof HTMLElement && !overlay.matches(CLOSED_OVERLAY)) return true
  }
  return false
}

export function installInertBackground(root: HTMLElement) {
  const sync = () => {
    if (openOverlaySiblings(root)) {
      if (root.getAttribute('aria-hidden') === 'true') {
        root.removeAttribute('aria-hidden')
        root.setAttribute('inert', '')
      }
      return
    }
    root.removeAttribute('aria-hidden')
    root.removeAttribute('inert')
  }
  // Portals mount as direct body children, so childList on body alone covers
  // mounts/unmounts. A second observer watches the subtree for the marker
  // attributes only (data-closed marks an exiting surface, aria-hidden is
  // Kobalte's own background marker). Splitting the scopes keeps ordinary app
  // DOM writes from running this sync on every mutation.
  const structureObserver = new MutationObserver(sync)
  structureObserver.observe(document.body, { childList: true })
  const attributeObserver = new MutationObserver(sync)
  attributeObserver.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-hidden', 'data-closed', 'data-expanded', 'hidden'],
  })
}
