import { Show, splitProps, type ComponentProps } from 'solid-js'

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/shadcn/field'
import { Input } from '@/components/shadcn/input'

type ValidatedInputProps = Omit<
  ComponentProps<typeof Input>,
  'id' | 'aria-invalid' | 'aria-describedby'
> & {
  id: string
  label: string
  description?: string
  error?: string
}

export function ValidatedInput(props: ValidatedInputProps) {
  const [local, rest] = splitProps(props, ['id', 'label', 'description', 'error'])
  const descriptionId = () => (local.description ? `${local.id}-description` : undefined)
  const errorId = () => (local.error ? `${local.id}-error` : undefined)
  const describedBy = () => [descriptionId(), errorId()].filter(Boolean).join(' ') || undefined

  return (
    <Field data-invalid={local.error ? true : undefined}>
      <FieldLabel for={local.id}>{local.label}</FieldLabel>
      <Input
        {...rest}
        id={local.id}
        aria-invalid={local.error ? true : undefined}
        aria-describedby={describedBy()}
      />
      <Show when={local.description}>
        <FieldDescription id={descriptionId()}>{local.description}</FieldDescription>
      </Show>
      <Show when={local.error}>
        <FieldError id={errorId()}>{local.error}</FieldError>
      </Show>
    </Field>
  )
}
