import { Check, Copy, RefreshCw, X } from 'lucide-solid'
import { For, Show, splitProps, type ComponentProps } from 'solid-js'

import { cn } from '@/lib/utils'

import type { AnswerResponse, BrainStatus, ContextBundle, Evidence } from '../types'
import { codeRevisionLabel } from '../codeEvidence'
import { useClipboardCopy } from '../useClipboardCopy'
import { Alert, AlertDescription } from './shadcn/alert'
import { Badge } from './shadcn/badge'
import { TooltipButton as Button } from './cortana/TooltipButton'
import { Card } from './shadcn/card'
import { ScrollArea } from './shadcn/scroll-area'
import { Spinner } from './shadcn/spinner'

type ActionButtonProps = Omit<ComponentProps<typeof Button>, 'variant' | 'size'> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon' | 'compact'
}

function ActionButton(props: ActionButtonProps) {
  const [local, rest] = splitProps(props, ['variant'])
  const variant = () => local.variant ?? 'secondary'
  return (
    <Button
      {...rest}
      variant={
        variant() === 'primary'
          ? 'default'
          : variant() === 'danger'
            ? 'destructive'
            : variant() === 'ghost' || variant() === 'icon'
              ? 'ghost'
              : 'secondary'
      }
      size={variant() === 'icon' ? 'icon' : variant() === 'compact' ? 'sm' : 'default'}
    />
  )
}

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
  const { copied, copyError, copy } = useClipboardCopy(
    () => props.serverContext?.context ?? props.context
  )

  return (
    <aside
      class={cn('context-panel m7-context-panel', props.open && 'mobile-open')}
      data-m7-context-panel=""
    >
      <div class="context-heading">
        <strong>Agent context</strong>
        <ActionButton
          variant="icon"
          aria-label="Close agent context"
          tooltip="Close agent context"
          class=""
          onClick={props.onClose}
        >
          <X size={17} />
        </ActionButton>
      </div>
      <ScrollArea class="context-scroll">
        <Card class="query-summary">
          <span>Query</span>
          <p>{props.query}</p>
        </Card>
        <Show when={props.answer}>
          {(answer) => (
            <section class="retrieval-diagnostics">
              <span class="section-title">Retrieval diagnostics</span>
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
          <Badge variant="secondary">{props.evidence.length}</Badge>
        </section>
        <div class="evidence-list">
          <For each={props.evidence}>
            {(item, index) => (
              <ActionButton
                variant="ghost"
                type="button"
                class={cn(props.selected === index() && 'selected')}
                onClick={() => props.onSelect(index())}
              >
                <span>{index() + 1}</span>
                <strong>{item.title}</strong>
                <Show when={codeRevisionLabel(item)}>
                  <small>{codeRevisionLabel(item)}</small>
                </Show>
                <time>{new Date(item.updated_at).toLocaleDateString()}</time>
              </ActionButton>
            )}
          </For>
        </div>
        <Show when={props.serverContext?.memories && props.serverContext.memories.length > 0}>
          <section class="section-label">
            <span>Native agent memory</span>
            <Badge variant="secondary">{props.serverContext!.memories?.length}</Badge>
          </section>
          <div class="evidence-list">
            <For each={props.serverContext!.memories}>
              {(memory) => (
                <div class="utility-item">
                  <div class="utility-item-main">
                    <strong>{memory.title}</strong>
                    <time>
                      {memory.content_type ?? memory.kind} · {memory.retention_tier ?? 'durable'} ·{' '}
                      {memory.scope ?? 'workspace'} · {memory.project} · confidence{' '}
                      {memory.confidence.toFixed(2)}
                      {memory.valid_until
                        ? ` · expires ${new Date(memory.valid_until).toLocaleDateString()}`
                        : ''}
                    </time>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
        <Show when={props.serverContext?.degradation}>
          <p class="context-error" role="status">
            Degraded retrieval:{' '}
            {props.serverContext!.degradation!.detail || props.serverContext!.degradation!.code}
          </p>
        </Show>
        <section class="provenance">
          <span class="section-title">Embedding</span>
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
          <span class="section-title">Agent integration bundle</span>
          <p>
            Build the exact bounded context returned by the HTTP and MCP query layer for this
            workspace scope.
          </p>
          <ActionButton
            variant="secondary"
            disabled={props.contextLoading}
            onClick={props.onRetrieveContext}
          >
            {props.contextLoading ? <Spinner /> : <RefreshCw size={15} />}
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
          variant="primary"
          aria-label="Copy agent context"
          tooltip="Copy agent context"
          class=""
          onClick={() => void copy()}
        >
          {copied() ? <Check size={17} /> : <Copy size={17} />}
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
