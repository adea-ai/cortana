import { createMemo, createSignal, Show, splitProps, type ComponentProps } from 'solid-js'
import { createFilter } from '@kobalte/core/i18n'
import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxControl,
  ComboboxInput,
  ComboboxItem,
  ComboboxTrigger,
} from '@adea-ai/ui/components/ui/combobox'

import { cn } from '@/lib/utils'

type ModelOption = {
  value: string
  label: string
}

const modelFilter = createFilter({ sensitivity: 'base' })

export function SettingsModelCombobox(
  props: Omit<ComponentProps<typeof ComboboxInput>, 'value'> & {
    value: string
    choices: ModelOption[]
    onValueChange: (value: string) => void
    showClear?: boolean
    showTrigger?: boolean
  }
) {
  const [local, rootProps, inputProps] = splitProps(
    props,
    ['value', 'choices', 'onValueChange', 'class', 'showClear', 'showTrigger'],
    ['name', 'required']
  )
  const [query, setQuery] = createSignal('')
  const hasMatchingChoice = createMemo(() =>
    local.choices.some((choice) => modelFilter.contains(choice.label, query()))
  )

  return (
    <Combobox<ModelOption>
      options={local.choices}
      optionValue="value"
      optionTextValue="label"
      optionLabel="label"
      defaultFilter={(option, inputValue) => modelFilter.contains(option.label, inputValue)}
      allowsEmptyCollection
      name={rootProps.name}
      required={rootProps.required}
      disabled={inputProps['disabled']}
      value={local.choices.find((choice) => choice.value === local.value) ?? null}
      onInputChange={setQuery}
      onChange={(option) => {
        if (option && option.value !== local.value) local.onValueChange(option.value)
      }}
      itemComponent={(itemProps) => (
        <ComboboxItem item={itemProps.item}>{itemProps.item.rawValue.label}</ComboboxItem>
      )}
    >
      <ComboboxControl class={cn('settings-model-control', local.class)}>
        {(control) => (
          <>
            <ComboboxInput {...inputProps} class="min-w-0 flex-1" />
            <Show when={local.showTrigger ?? true}>
              <ComboboxTrigger aria-label="Toggle options" />
            </Show>
            <Show when={local.showClear && !inputProps['disabled']}>
              <ComboboxClear
                onClear={() => {
                  control.clear()
                  local.onValueChange('')
                }}
              />
            </Show>
          </>
        )}
      </ComboboxControl>
      <ComboboxContent>
        <Show when={!hasMatchingChoice()}>
          <div
            role="status"
            class="flex w-full justify-center py-2 text-center text-sm text-muted-foreground"
          >
            No matching models.
          </div>
        </Show>
      </ComboboxContent>
    </Combobox>
  )
}
