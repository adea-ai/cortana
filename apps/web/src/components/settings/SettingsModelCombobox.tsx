import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '../shadcn/combobox'

export function SettingsModelCombobox({
  value,
  choices,
  onValueChange,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange'> & {
  value: string
  choices: Array<{ value: string; label: ReactNode }>
  onValueChange: (value: string) => void
}) {
  return (
    <Combobox value={value} onValueChange={(next) => next && onValueChange(String(next))}>
      <ComboboxInput
        {...props}
        className={cn('border-border bg-background shadow-xs', props.className)}
        value={value}
      />
      <ComboboxContent>
        <ComboboxEmpty>No matching models.</ComboboxEmpty>
        <ComboboxList>
          {choices.map((choice) => (
            <ComboboxItem key={choice.value} value={choice.value}>
              {choice.label}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
