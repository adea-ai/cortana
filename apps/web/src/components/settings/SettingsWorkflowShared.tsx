import { Check, LoaderCircle, X } from 'lucide-solid'

import { cn } from '@/lib/utils'

export function StatusGlyph(props: { passed: boolean; optional?: boolean; pending?: boolean }) {
  return (
    <i
      class={cn(
        'status-glyph',
        props.pending ? 'pending' : props.passed ? 'passed' : props.optional ? 'optional' : 'failed'
      )}
      aria-label={
        props.pending
          ? 'In progress'
          : props.passed
            ? 'Passed'
            : props.optional
              ? 'Optional'
              : 'Failed'
      }
      role="img"
    >
      {props.pending ? (
        <LoaderCircle class="spin" size={13} />
      ) : props.passed ? (
        <Check size={13} />
      ) : (
        <X size={13} />
      )}
    </i>
  )
}
