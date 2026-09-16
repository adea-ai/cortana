import { Show, splitProps, type ComponentProps, type JSX } from 'solid-js'

import { InputGroup, InputGroupButton, InputGroupInput } from '../shadcn/input-group'

export function SettingsSecretInputGroup(
  props: {
    value: string
    disabled: boolean
    onChange: JSX.EventHandler<HTMLInputElement, Event>
    onClear?: () => void
  } & Pick<ComponentProps<'input'>, 'id' | 'aria-label' | 'aria-describedby' | 'aria-invalid'>
) {
  const [local, rest] = splitProps(props, [
    'value',
    'disabled',
    'onChange',
    'onClear',
    'aria-label',
  ])
  return (
    <InputGroup class="secret-input">
      <InputGroupInput
        {...rest}
        aria-label={local['aria-label'] ?? 'New API key'}
        type="password"
        autocomplete="new-password"
        value={local.value}
        disabled={local.disabled}
        onChange={local.onChange}
      />
      <Show when={local.onClear}>
        <InputGroupButton size="xs" onClick={local.onClear}>
          Clear
        </InputGroupButton>
      </Show>
    </InputGroup>
  )
}
