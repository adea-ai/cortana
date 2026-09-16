import { Slider as SliderPrimitive } from '@kobalte/core/slider'
import { splitProps, type ComponentProps } from 'solid-js'

import { cn } from '@/lib/utils'

function Slider(props: ComponentProps<typeof SliderPrimitive>) {
  const [local, rest] = splitProps(props, ['class', 'value', 'defaultValue'])
  return (
    <SliderPrimitive
      class={cn(
        'data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full',
        local.class
      )}
      data-slot="slider"
      value={
        Array.isArray(local.value)
          ? local.value
          : local.value !== undefined
            ? [local.value]
            : undefined
      }
      defaultValue={
        Array.isArray(local.defaultValue)
          ? local.defaultValue
          : local.defaultValue !== undefined
            ? [local.defaultValue]
            : undefined
      }
      {...rest}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        class="relative flex w-full grow touch-none items-center overflow-hidden rounded-full bg-muted select-none data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1"
      >
        <SliderPrimitive.Fill
          data-slot="slider-range"
          class="absolute bg-primary select-none data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
        />
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          class="relative block size-3 shrink-0 rounded-full border border-ring bg-background ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50"
        >
          <SliderPrimitive.Input class="sr-only" />
        </SliderPrimitive.Thumb>
      </SliderPrimitive.Track>
    </SliderPrimitive>
  )
}

export { Slider }
