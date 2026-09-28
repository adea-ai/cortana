import { splitProps, type ComponentProps, type JSX } from 'solid-js'

import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
} from '@adea-ai/ui/components/ui/combobox'
import { cn } from '@/lib/utils'

export function SettingsModelCombobox(
  props: Omit<ComponentProps<typeof ComboboxInput>, 'value'> & {
    value: string
    choices: Array<{ value: string; label: JSX.Element }>
    onValueChange: (value: string) => void
  }
) {
  const [local, rest] = splitProps(props, ['value', 'choices', 'onValueChange', 'class'])
  return (
    <Combobox
      options={local.choices}
      optionValue="value"
      optionTextValue="label"
      value={local.choices.find((choice) => String(choice.value) === local.value) ?? null}
      onChange={(option) => option && local.onValueChange(String(option.value))}
      itemComponent={(itemProps) => (
        <ComboboxItem item={itemProps.item}>{itemProps.item.rawValue.label}</ComboboxItem>
      )}
    >
      <ComboboxInput {...rest} class={cn('border-border bg-background shadow-xs', local.class)} />
      <ComboboxContent />
    </Combobox>
  )
}
