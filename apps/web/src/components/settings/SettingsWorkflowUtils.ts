export { useDesktopForeground } from '../../lib/foreground'

export function applyConfirmed(decision: boolean | Promise<boolean>, action: () => void): void {
  if (typeof decision === 'boolean') {
    if (decision) action()
    return
  }
  void decision.then((confirmed) => confirmed && action())
}
