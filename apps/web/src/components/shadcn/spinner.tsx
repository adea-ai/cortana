import { splitProps } from 'solid-js'
import type { LucideProps } from 'lucide-solid'
import { Loader2Icon } from 'lucide-solid'

import { cn } from '@/lib/utils'

function Spinner(props: LucideProps) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      class={cn('size-4 animate-spin', local.class)}
      {...rest}
    />
  )
}

export { Spinner }
