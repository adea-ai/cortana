import { Toaster as Sonner, type ToasterProps } from 'solid-sonner'
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from 'lucide-solid'

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      class="toaster group"
      icons={{
        success: <CircleCheckIcon class="size-4" />,
        info: <InfoIcon class="size-4" />,
        warning: <TriangleAlertIcon class="size-4" />,
        error: <OctagonXIcon class="size-4" />,
        loading: <Loader2Icon class="size-4 animate-spin" />,
      }}
      style={{
        '--normal-bg': 'var(--popover)',
        '--normal-text': 'var(--popover-foreground)',
        '--normal-border': 'var(--border)',
        '--border-radius': 'var(--radius)',
      }}
      toastOptions={{
        classes: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
