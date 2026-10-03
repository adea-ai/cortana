export async function waitForInitialKeyboardTarget(page) {
  const skipLink = page.locator('a[href="#main-content"]')
  await skipLink.waitFor({ state: 'visible' })
  return skipLink
}

export async function setViewportAndWaitForLayout(page, viewport) {
  await page.setViewportSize(viewport)
  await page.evaluate(
    () =>
      new Promise((resolveLayout) =>
        requestAnimationFrame(() => requestAnimationFrame(resolveLayout))
      )
  )
}

/**
 * Wait until the control's computed colors have reached their final state.
 * Variant changes can briefly combine the old foreground with the new fill,
 * and Axe reads computed styles rather than waiting for CSS transitions.
 */
export async function waitForTransitionStylesToSettle(element, timeoutMs = 3_000, runtime = {}) {
  const now = runtime.now ?? (() => performance.now())
  const nextFrame =
    runtime.nextFrame ?? (() => new Promise((resolveFrame) => requestAnimationFrame(resolveFrame)))
  const getAnimations =
    runtime.getAnimations ?? ((control) => control.getAnimations({ subtree: true }))
  const flushStyles =
    runtime.flushStyles ??
    ((control) => {
      const controlStyle = getComputedStyle(control)
      void controlStyle.color
      void controlStyle.backgroundColor
      const label = control.querySelector('.graph-node-label')
      if (label) void getComputedStyle(label).color
    })
  const deadline = now() + timeoutMs
  let settledFrames = 0

  while (now() < deadline) {
    await nextFrame()
    if (now() >= deadline) break

    // Force style resolution before checking the animation list. Some engines
    // create the transition only after observing the class change on a frame.
    flushStyles(element)
    const active = getAnimations(element).filter(
      (animation) => animation.playState !== 'idle' && animation.playState !== 'finished'
    )

    if (active.length) settledFrames = 0
    else if (++settledFrames >= 2) return
  }

  throw new Error(`Control color transitions did not settle within ${timeoutMs}ms`)
}
