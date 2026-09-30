import { Dynamic } from 'solid-js/web'

import { sourceBrandForKind, sourceIconForKind } from './sourceIconData'

export function SourceIcon(props: { kind: string; size?: number }) {
  const brand = () => sourceBrandForKind(props.kind)
  const size = () => props.size ?? 17
  return (
    <>
      {brand() ? (
        <svg
          viewBox="0 0 24 24"
          width={size()}
          height={size()}
          fill={`#${brand()!.hex}`}
          aria-hidden="true"
        >
          <path d={brand()!.path} />
        </svg>
      ) : (
        <Dynamic
          component={sourceIconForKind(props.kind)}

          size={size()}
          aria-hidden="true"
        />
      )}
    </>
  )
}
