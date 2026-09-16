import { splitProps, type ComponentProps, type JSX } from 'solid-js'

import { cn } from '@/lib/utils'

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  type ComboboxOptionValue,
} from '../shadcn/combobox'

export function SettingsModelCombobox(
  props: Omit<ComponentProps<'input'>, 'value' | 'onChange'> & {
    value: string
    choices: Array<{ value: string; label: JSX.Element }>
    onValueChange: (value: string) => void
  }
) {
  const [local, rest] = splitProps(props, ['value', 'choices', 'onValueChange'])
  return (
    <Combobox<ComboboxOptionValue>
      options={local.choices}
      value={local.choices.find((choice) => String(choice.value) === local.value) ?? null}
      onChange={(option) => option && local.onValueChange(String(option.value))}
      itemComponent={(itemProps) => (
        <ComboboxItem item={itemProps.item}>{itemProps.item.rawValue.label}</ComboboxItem>
      )}
    >
      <ComboboxInput
        {...(rest as any)}
        class={cn('border-border bg-background shadow-xs', rest.class)}
      />
      <ComboboxContent>
        <ComboboxEmpty>No matching models.</ComboboxEmpty>
        <ComboboxList />
      </ComboboxContent>
    </Combobox>
  )
}
