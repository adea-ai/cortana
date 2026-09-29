import { CircleAlert, CircleCheck, Inbox, RotateCcw } from 'lucide-solid'
import { Show } from 'solid-js'

import { Alert, AlertDescription, AlertTitle } from '@adea-ai/ui/components/ui/alert'
import { cn } from '@/lib/utils'
import { Button } from '@adea-ai/ui/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@adea-ai/ui/components/ui/empty'
import { Skeleton } from '@adea-ai/ui/components/ui/skeleton'

type FeedbackStateProps = {
  kind: 'loading' | 'empty' | 'error' | 'success' | 'warning'
  title: string
  description: string
  onRetry?: () => void
}

export function FeedbackState(props: FeedbackStateProps) {
  return (
    <Show
      when={props.kind !== 'loading'}
      fallback={
        <div
          class="flex flex-col gap-3"
          role="status"
          aria-busy="true"
          aria-label={`${props.title}: ${props.description}`}
        >
          <Skeleton class="h-5 w-2/5" />
          <Skeleton class="h-20 w-full" />
        </div>
      }
    >
      <Show
        when={props.kind !== 'empty'}
        fallback={
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{props.title}</EmptyTitle>
              <EmptyDescription>{props.description}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      >
        <Alert
          class={cn(
            props.kind === 'success' && 'border-success/40 text-success',
            props.kind === 'warning' && 'border-warning/40 text-warning',
            props.kind === 'error' && 'border-destructive/40 text-destructive'
          )}
        >
          <Show when={props.kind === 'success'} fallback={<CircleAlert aria-hidden="true" />}>
            <CircleCheck aria-hidden="true" />
          </Show>
          <AlertTitle>{props.title}</AlertTitle>
          <AlertDescription>{props.description}</AlertDescription>
          <Show when={props.kind === 'error' && props.onRetry}>
            <EmptyContent class="mt-3 items-start">
              <Button variant="outline" size="xs" onClick={props.onRetry}>
                <RotateCcw data-icon="inline-start" />
                Retry
              </Button>
            </EmptyContent>
          </Show>
        </Alert>
      </Show>
    </Show>
  )
}
