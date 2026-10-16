import { StatusChip } from '@adea-ai/ui/components/ui/status-chip'

export function StatusGlyph(props: {
  passed: boolean
  optional?: boolean
  pending?: boolean
  cancelled?: boolean
}) {
  const label = () =>
    props.pending
      ? 'In progress'
      : props.passed
        ? 'Passed'
        : props.cancelled
          ? 'Cancelled'
          : props.optional
            ? 'Optional'
            : 'Failed'
  return (
    <StatusChip
      role="img"
      aria-label={label()}
      label={label()}
      tone={
        props.pending
          ? 'pending'
          : props.passed
            ? 'success'
            : props.cancelled || props.optional
              ? 'neutral'
              : 'danger'
      }
    />
  )
}
