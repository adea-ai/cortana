import { Dynamic } from 'solid-js/web'

import { sourceBrandForKind, sourceIconForKind } from './sourceIconData'

// Brand marks render in the surrounding ink: several brand hexes (GitHub,
// Slack, Apple) are near-invisible on the dark-only chrome, and the shared
// icon tiles own their own contrast.
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
          fill="currentColor"
          aria-hidden="true"
        >
          <path d={brand()!.path} />
        </svg>
      ) : (
        <Dynamic component={sourceIconForKind(props.kind)} size={size()} aria-hidden="true" />
      )}
    </>
  )
}
