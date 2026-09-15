import type { CSSProperties } from 'react'

import { sourceBrandForKind, sourceIconForKind } from './sourceIconData'

export function SourceIcon({ kind, size = 17 }: { kind: string; size?: number }) {
  const brand = sourceBrandForKind(kind)
  if (!brand) {
    const Icon = sourceIconForKind(kind)
    // oxlint-disable-next-line react/static-components -- sourceIconForKind is a lookup, not a component factory
    return <Icon className="source-icon" size={size} aria-hidden="true" />
  }
  return (
    <svg
      className="source-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={{ '--source-icon-color': `#${brand.hex}` } as CSSProperties}
    >
      <path d={brand.path} />
    </svg>
  )
}
