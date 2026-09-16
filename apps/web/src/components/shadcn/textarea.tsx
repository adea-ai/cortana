import { splitProps, type ComponentProps } from 'solid-js'

import { cn } from '@/lib/utils'

// Callers use onChange with React semantics (per-keystroke), but Solid wires
// it to the native change event which only fires on commit. Relay both
// handlers through input so typing and pasting update live.
// The handler union types differ per event kind; runtime shapes are
// compatible, so invoke either the plain or data-bound form loosely.
function invokeTextareaHandler(handler: unknown, event: Event) {
  if (typeof handler === 'function') (handler as (event: Event) => void)(event)
  else if (Array.isArray(handler)) {
    ;(handler[0] as (data: unknown, event: Event) => void)(handler[1], event)
  }
}

function Textarea(props: ComponentProps<'textarea'>) {
  const [local, rest] = splitProps(props, ['class', 'onChange', 'onInput'])
  return (
    <textarea
      onInput={(event) => {
        invokeTextareaHandler(local.onInput, event)
        invokeTextareaHandler(local.onChange, event)
      }}
      onChange={local.onChange}
      data-slot="textarea"
      class={cn(
        'flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        local.class
      )}
      {...rest}
    />
  )
}

export { Textarea }
