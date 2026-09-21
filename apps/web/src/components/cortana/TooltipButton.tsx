import { Show, splitProps, type ComponentProps } from 'solid-js'

import { Button } from '../shadcn/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../shadcn/tooltip'

type TooltipButtonProps = ComponentProps<typeof Button> & {
  tooltip?: string
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
}

// rest is exactly the Button surface (TooltipButtonProps minus the split
// keys); Kobalte's polymorphic `as` prop cannot express that, so the cast
// names the precise component the props are forwarded to.
type TooltipButtonRest = Omit<TooltipButtonProps, 'tooltip' | 'tooltipSide'>

/** Shared shadcn button composition for concise, accessible action help. */
export function TooltipButton(props: TooltipButtonProps) {
  const [local, rest] = splitProps(props, ['tooltip', 'tooltipSide'])
  return (
    <Show when={local.tooltip} fallback={<Button {...rest} />}>
      {(tooltip) => (
        <Tooltip>
          <TooltipTrigger as={Button} {...(rest as TooltipButtonRest)} />
          <TooltipContent side={local.tooltipSide}>{tooltip()}</TooltipContent>
        </Tooltip>
      )}
    </Show>
  )
}
