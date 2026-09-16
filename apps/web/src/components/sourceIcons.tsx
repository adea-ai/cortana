import type { JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'

import { sourceBrandForKind, sourceIconForKind } from './sourceIconData'

export function SourceIcon(props: { kind: string; size?: number }) {
  const brand = () => sourceBrandForKind(props.kind)
  const size = () => props.size ?? 17
  return (
    <>
      {brand() ? (
        <svg
          class="source-icon"
          viewBox="0 0 24 24"
          width={size()}
          height={size()}
          fill="currentColor"
          aria-hidden="true"

          style={{ '--source-icon-color': `#${brand()!.hex}` } as JSX.CSSProperties}
        >
          <path d={brand()!.path} />
        </svg>
      ) : (
        <Dynamic
          component={sourceIconForKind(props.kind)}
          class="source-icon"
          size={size()}
          aria-hidden="true"
        />
      )}
    </>
  )
}
