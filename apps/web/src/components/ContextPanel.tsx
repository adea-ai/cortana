import {
  Alert as SharedFeedbackAlert,
  AlertDescription as SharedFeedbackDescription,
} from '@adea-ai/ui/components/ui/alert'
import { ListRow } from '@adea-ai/ui/components/composites/list-row'
import { Check, Copy, RefreshCw, X } from 'lucide-solid'
import { For, Show } from 'solid-js'

import { createMediaQuery } from '@/lib/mediaQuery'

import type { AnswerResponse, BrainStatus, ContextBundle, Evidence } from '../types'
import { codeRevisionLabel } from '../codeEvidence'
import { useClipboardCopy } from '../useClipboardCopy'
import { Alert, AlertDescription } from '@adea-ai/ui/components/ui/alert'
import { Badge } from '@adea-ai/ui/components/ui/badge'
import { ActionButton } from '@adea-ai/ui/components/composites/action-button'
import { Card, CardContent } from '@adea-ai/ui/components/ui/card'
import { PropertyList, PropertyTerm, PropertyValue } from '@adea-ai/ui/components/composites/stat'
import { Separator } from '@adea-ai/ui/components/ui/separator'
import { Heading, Text } from '@adea-ai/ui/components/ui/typography'
import {
  Panel,
  PanelActions,
  PanelBody,
  PanelFooter,
  PanelHeader,
  PanelTitle,
} from '@adea-ai/ui/components/layout/panel'
import { Spinner } from '@adea-ai/ui/components/ui/spinner'

export function ContextPanel(props: {
  query: string
  evidence: Evidence[]
  answer: AnswerResponse | null
  selected: number
  status: BrainStatus | null
  context: string
  contextTokens: number
  serverContext: ContextBundle | null
  contextLoading: boolean
  contextError: string
  onRetrieveContext: () => void
  onSelect: (index: number) => void
  onClose: () => void
}) {
  const compact = createMediaQuery(() => '(max-width: 1280px)')
  const { copied, copyError, copy } = useClipboardCopy(
    () => props.serverContext?.context ?? props.context
  )

  return (
    <Panel data-m7-context-panel="">
      <PanelHeader>
        <PanelTitle>Agent context</PanelTitle>
        <PanelActions>
          <Show when={compact()}>
            <ActionButton
              variant="ghost"
              size="icon-sm"
              aria-label="Close agent context"
              tooltip="Close agent context"
              onClick={props.onClose}
            >
              <X aria-hidden="true" />
            </ActionButton>
          </Show>
        </PanelActions>
      </PanelHeader>
      <PanelBody class="flex flex-col gap-4">
        <Card size="sm">
          <CardContent class="flex flex-col gap-1">
            <Text variant="overline">Query</Text>
            <Text>{props.query}</Text>
          </CardContent>
        </Card>
        <Show when={props.answer}>
          {(answer) => (
            <section class="flex flex-col gap-2">
              <Heading as="h3" size="subsection">
                Retrieval diagnostics
              </Heading>
              <PropertyList>
                <PropertyTerm>Mode</PropertyTerm>
                <PropertyValue>{answer().mode}</PropertyValue>
                <PropertyTerm>Latency</PropertyTerm>
                <PropertyValue>
                  {answer().cached ? 'cache hit' : `${answer().latency_ms} ms`}
                </PropertyValue>
                <PropertyTerm>Planned queries</PropertyTerm>
                <PropertyValue>{answer().plan.queries.length}</PropertyValue>
                <PropertyTerm>Evidence</PropertyTerm>
                <PropertyValue>{answer().evidence.length}</PropertyValue>
              </PropertyList>
              <ol class="list-decimal ps-5 marker:text-muted-foreground">
                <For each={answer().plan.queries}>
                  {(planned) => (
                    <li>
                      <Text variant="caption" tone="muted">
                        {planned}
                      </Text>
                    </li>
                  )}
                </For>
              </ol>
            </section>
          )}
        </Show>
        <Separator />
        <section class="flex flex-col gap-1">
          <div class="flex items-center justify-between gap-2">
            <Heading as="h3" size="subsection">
              Retrieved evidence
            </Heading>
            <Badge variant="outline">{props.evidence.length}</Badge>
          </div>
          <For each={props.evidence}>
            {(item, index) => (
              <ListRow
                as="button"
                type="button"
                selected={props.selected === index()}
                tooltip={`Inspect evidence: ${item.title}`}
                onClick={() => props.onSelect(index())}
                leading={<span>{index() + 1}</span>}
                description={codeRevisionLabel(item) ?? undefined}
                trailing={<time>{new Date(item.updated_at).toLocaleDateString()}</time>}
                class="w-full text-left"
              >
                {item.title}
              </ListRow>
            )}
          </For>
        </section>
        <Show when={props.serverContext?.memories && props.serverContext.memories.length > 0}>
          <section class="flex flex-col gap-1">
            <div class="flex items-center justify-between gap-2">
              <Heading as="h3" size="subsection">
                Native agent memory
              </Heading>
              <Badge variant="outline">{props.serverContext!.memories?.length}</Badge>
            </div>
            <For each={props.serverContext!.memories}>
              {(memory) => (
                <ListRow
                  description={`${memory.content_type ?? memory.kind} · ${memory.retention_tier ?? 'durable'} · ${memory.scope ?? 'workspace'} · ${memory.project} · confidence ${memory.confidence.toFixed(2)}${memory.valid_until ? ` · expires ${new Date(memory.valid_until).toLocaleDateString()}` : ''}`}
                >
                  {memory.title}
                </ListRow>
              )}
            </For>
          </section>
        </Show>
        <Show when={props.serverContext?.degradation}>
          <SharedFeedbackAlert variant="warning" role="status">
            <SharedFeedbackDescription>
              Degraded retrieval:{' '}
              {props.serverContext!.degradation!.detail || props.serverContext!.degradation!.code}
            </SharedFeedbackDescription>
          </SharedFeedbackAlert>
        </Show>
        <Separator />
        <section class="flex flex-col gap-1 break-all">
          <Heading as="h3" size="subsection">
            Embedding
          </Heading>
          <Text variant="caption" tone="muted" as="p">
            {props.status?.embedding_fingerprint ?? 'unavailable'}
          </Text>
          <Show when={props.serverContext?.context_bundle_id}>
            <Text variant="caption" tone="muted" as="p">
              Bundle {props.serverContext!.context_bundle_id!.slice(0, 16)}…
            </Text>
          </Show>
          <Text variant="caption" tone="muted" as="p">
            {props.contextTokens.toLocaleString()} context tokens ·{' '}
            {(props.status?.embedding_cache_hits ?? 0).toLocaleString()} cache hits
          </Text>
        </section>
        <Separator />
        <section class="flex flex-col gap-2">
          <Heading as="h3" size="subsection">
            Agent integration bundle
          </Heading>
          <Text variant="caption" tone="muted" as="p">
            Build the exact bounded context returned by the HTTP and MCP query layer for this
            workspace scope.
          </Text>
          <ActionButton
            tooltip={'Retrieve a bounded workspace context bundle for agent integrations.'}
            variant="outline"
            size="sm"
            class="w-full"
            disabled={props.contextLoading}
            onClick={props.onRetrieveContext}
          >
            {props.contextLoading ? <Spinner /> : <RefreshCw aria-hidden="true" />}
            {props.serverContext
              ? 'Refresh MCP-equivalent context'
              : 'Build MCP-equivalent context'}
          </ActionButton>
          <Show when={props.contextError}>
            <Alert variant="destructive">
              <AlertDescription>{props.contextError}</AlertDescription>
            </Alert>
          </Show>
          <Show when={props.serverContext}>
            {(serverContext) => (
              <PropertyList>
                <PropertyTerm>Included</PropertyTerm>
                <PropertyValue>{serverContext().metrics.included}</PropertyValue>
                <PropertyTerm>Omitted</PropertyTerm>
                <PropertyValue>{serverContext().metrics.omitted}</PropertyValue>
                <PropertyTerm>Tokens</PropertyTerm>
                <PropertyValue>
                  {serverContext().metrics.estimated_tokens.toLocaleString()} /{' '}
                  {serverContext().metrics.max_tokens.toLocaleString()}
                </PropertyValue>
              </PropertyList>
            )}
          </Show>
        </section>
      </PanelBody>
      <PanelFooter class="flex-col items-stretch">
        <ActionButton
          variant="default"
          size="sm"
          class="w-full"
          aria-label="Copy agent context"
          tooltip="Copy agent context"
          onClick={() => void copy()}
        >
          {copied() ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied()
            ? 'Context copied'
            : props.serverContext
              ? 'Copy MCP-equivalent context'
              : 'Copy preview context'}
        </ActionButton>
        <Show when={copyError()}>
          <Alert variant="destructive">
            <AlertDescription>{copyError()}</AlertDescription>
          </Alert>
        </Show>
      </PanelFooter>
    </Panel>
  )
}
