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
  props: Omit<ComponentProps<typeof ComboboxInput>, 'value'> & {
    value: string
    choices: Array<{ value: string; label: JSX.Element }>
    onValueChange: (value: string) => void
  }
) {
  const [local, rest] = splitProps(props, ['value', 'choices', 'onValueChange', 'class'])
  return (
    <Combobox<ComboboxOptionValue>
      options={local.choices}
      value={local.choices.find((choice) => String(choice.value) === local.value) ?? null}
      onChange={(option) => option && local.onValueChange(String(option.value))}
      itemComponent={(itemProps) => (
        <ComboboxItem item={itemProps.item}>{itemProps.item.rawValue.label}</ComboboxItem>
      )}
    >
      <ComboboxInput {...rest} class={cn('border-border bg-background shadow-xs', local.class)} />
      <ComboboxContent>
        <ComboboxEmpty>No matching models.</ComboboxEmpty>
        <ComboboxList />
      </ComboboxContent>
    </Combobox>
  )
}
