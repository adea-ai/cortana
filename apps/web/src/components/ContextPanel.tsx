import {
  Alert as SharedFeedbackAlert,
  AlertDescription as SharedFeedbackDescription,
} from '@adea-ai/ui/components/ui/alert'
import { ListRow } from '@adea-ai/ui/components/composites/list-row'
import { Check, Copy, RefreshCw, X } from 'lucide-solid'
import { For, Show } from 'solid-js'

import { cn } from '@/lib/utils'
import { createMediaQuery } from '@/lib/mediaQuery'

import type { AnswerResponse, BrainStatus, ContextBundle, Evidence } from '../types'
import { codeRevisionLabel } from '../codeEvidence'
import { useClipboardCopy } from '../useClipboardCopy'
import { Alert, AlertDescription } from '@adea-ai/ui/components/ui/alert'
import { Badge } from '@adea-ai/ui/components/ui/badge'
import { ActionButton } from '@adea-ai/ui/components/composites/action-button'
import { Card } from '@adea-ai/ui/components/ui/card'
import { ScrollArea } from '@adea-ai/ui/components/ui/scroll-area'
import { PanelActions, PanelHeader, PanelTitle } from '@adea-ai/ui/components/layout/panel'
import { Spinner } from '@adea-ai/ui/components/ui/spinner'

export function ContextPanel(props: {
  open: boolean
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
    <aside
      class={cn('context-panel m7-context-panel', props.open && 'mobile-open')}
      data-m7-context-panel=""
    >
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
              <X size={17} aria-hidden="true" />
            </ActionButton>
          </Show>
        </PanelActions>
      </PanelHeader>
      <ScrollArea class="context-scroll">
        <Card class="gap-2 px-4">
          <span>Query</span>
          <p>{props.query}</p>
        </Card>
        <Show when={props.answer}>
          {(answer) => (
            <section class="retrieval-diagnostics">
              <span class="text-sm font-medium">Retrieval diagnostics</span>
              <dl>
                <div>
                  <dt>Mode</dt>
                  <dd>{answer().mode}</dd>
                </div>
                <div>
                  <dt>Latency</dt>
                  <dd>{answer().cached ? 'cache hit' : `${answer().latency_ms} ms`}</dd>
                </div>
                <div>
                  <dt>Planned queries</dt>
                  <dd>{answer().plan.queries.length}</dd>
                </div>
                <div>
                  <dt>Evidence</dt>
                  <dd>{answer().evidence.length}</dd>
                </div>
              </dl>
              <ol>
                <For each={answer().plan.queries}>{(planned) => <li>{planned}</li>}</For>
              </ol>
            </section>
          )}
        </Show>
        <section class="section-label">
          <span>Retrieved evidence</span>
          <Badge variant="outline">{props.evidence.length}</Badge>
        </section>
        <div class="evidence-list">
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
        </div>
        <Show when={props.serverContext?.memories && props.serverContext.memories.length > 0}>
          <section class="section-label">
            <span>Native agent memory</span>
            <Badge variant="outline">{props.serverContext!.memories?.length}</Badge>
          </section>
          <div class="evidence-list">
            <For each={props.serverContext!.memories}>
              {(memory) => (
                <ListRow
                  description={`${memory.content_type ?? memory.kind} · ${memory.retention_tier ?? 'durable'} · ${memory.scope ?? 'workspace'} · ${memory.project} · confidence ${memory.confidence.toFixed(2)}${memory.valid_until ? ` · expires ${new Date(memory.valid_until).toLocaleDateString()}` : ''}`}
                >
                  {memory.title}
                </ListRow>
              )}
            </For>
          </div>
        </Show>
        <Show when={props.serverContext?.degradation}>
          <SharedFeedbackAlert variant="warning" role="status" class="my-2">
            <SharedFeedbackDescription>
              Degraded retrieval:{' '}
              {props.serverContext!.degradation!.detail || props.serverContext!.degradation!.code}
            </SharedFeedbackDescription>
          </SharedFeedbackAlert>
        </Show>
        <section class="provenance">
          <span class="text-sm font-medium">Embedding</span>
          <p>{props.status?.embedding_fingerprint ?? 'unavailable'}</p>
          <Show when={props.serverContext?.context_bundle_id}>
            <p>Bundle {props.serverContext!.context_bundle_id!.slice(0, 16)}…</p>
          </Show>
          <p>
            {props.contextTokens.toLocaleString()} context tokens ·{' '}
            {(props.status?.embedding_cache_hits ?? 0).toLocaleString()} cache hits
          </p>
        </section>
        <section class="server-context">
          <span class="text-sm font-medium">Agent integration bundle</span>
          <p>
            Build the exact bounded context returned by the HTTP and MCP query layer for this
            workspace scope.
          </p>
          <ActionButton
            tooltip={'Retrieve a bounded workspace context bundle for agent integrations.'}
            variant="outline"
            size="sm"
            class="w-full"
            disabled={props.contextLoading}
            onClick={props.onRetrieveContext}
          >
            {props.contextLoading ? <Spinner /> : <RefreshCw size={15} aria-hidden="true" />}
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
              <dl>
                <div>
                  <dt>Included</dt>
                  <dd>{serverContext().metrics.included}</dd>
                </div>
                <div>
                  <dt>Omitted</dt>
                  <dd>{serverContext().metrics.omitted}</dd>
                </div>
                <div>
                  <dt>Tokens</dt>
                  <dd>
                    {serverContext().metrics.estimated_tokens.toLocaleString()} /{' '}
                    {serverContext().metrics.max_tokens.toLocaleString()}
                  </dd>
                </div>
              </dl>
            )}
          </Show>
        </section>
      </ScrollArea>
      <div class="copy-area">
        <ActionButton
          variant="default"
          size="sm"
          class="w-full"
          aria-label="Copy agent context"
          tooltip="Copy agent context"
          onClick={() => void copy()}
        >
          {copied() ? (
            <Check size={17} aria-hidden="true" />
          ) : (
            <Copy size={17} aria-hidden="true" />
          )}
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
      </div>
    </aside>
  )
}
