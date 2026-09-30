/** Disabled help remains keyboard-reachable, so shared actions may use ARIA
 * disabling while controls without contextual help use native disabling. */
export function isActionDisabled(control: HTMLElement): boolean {
  return control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true'
}
