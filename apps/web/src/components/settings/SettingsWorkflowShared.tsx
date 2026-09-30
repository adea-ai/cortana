import { StatusChip } from '@adea-ai/ui/components/ui/status-chip'

export function StatusGlyph(props: { passed: boolean; optional?: boolean; pending?: boolean }) {
  const label = () =>
    props.pending ? 'In progress' : props.passed ? 'Passed' : props.optional ? 'Optional' : 'Failed'
  return (
    <StatusChip
      role="img"
      aria-label={label()}
      label={label()}
      tone={
        props.pending ? 'info' : props.passed ? 'success' : props.optional ? 'neutral' : 'danger'
      }
    />
  )
}
