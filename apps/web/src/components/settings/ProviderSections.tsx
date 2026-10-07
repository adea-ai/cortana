import { Spinner } from '@adea-ai/ui/components/ui/spinner'
import { Alert, AlertDescription } from '@adea-ai/ui/components/ui/alert'
import { RefreshCw } from 'lucide-solid'
import {
  createEffect,
  createSignal,
  createUniqueId,
  lazy,
  mergeProps,
  Suspense,
  type JSX,
} from 'solid-js'

import { isLoopbackUrl } from '../../operations'
import type { DesktopSettings } from '../../types'
import type { ModelChoice, ProviderValue } from './providerUtils'
import { useSettingsConfirm } from './SettingsConfirm'
import { applyConfirmed } from './SettingsWorkflowUtils'
import { FormField, NumberField, FieldGroup } from '@adea-ai/ui/components/ui/field'
import { SettingsRow, SettingsSection } from '@adea-ai/ui/components/composites/settings'
import { ActionButton } from '@adea-ai/ui/components/composites/action-button'
import { Input } from '@adea-ai/ui/components/ui/input'
import { NativeSelect } from '@adea-ai/ui/components/ui/native-select'
import { Switch } from '@adea-ai/ui/components/ui/switch'

const ValueCombobox = lazy(() =>
  import('@adea-ai/ui/components/ui/combobox').then((module) => ({
    default: module.ValueCombobox,
  }))
)
const SecretInputGroup = lazy(() =>
  import('@adea-ai/ui/components/ui/input-group').then((module) => ({
    default: module.SecretInputGroup,
  }))
)

export function EmbeddingSection(incoming: {
  settings: DesktopSettings
  secretValues: Record<string, string>
  onSecret: (values: Record<string, string>) => void
  clearedSecrets: Set<string>
  onClearSecret: (name: string) => void
  update: (change: (draft: DesktopSettings) => DesktopSettings) => void
  advertisedModels: readonly ModelChoice[] | null
  modelsLoading: boolean
  modelsError: string
  modelsTruncated: boolean
  onRefreshModels: () => void
}) {
  const props = incoming
  const setEmbedding = (embedding: DesktopSettings['embedding']) =>
    props.update((current) => ({
      ...current,
      embedding,
    }))
  return (
    <ProviderSection
      title="Embedding model"
      description="Local Qwen maximizes privacy and cache reuse. Cloud endpoints must use HTTPS."
      provider={props.settings.embedding}
      secrets={props.settings.secrets}
      secretValues={props.secretValues}
      onSecret={props.onSecret}
      clearedSecrets={props.clearedSecrets}
      onClearSecret={props.onClearSecret}
      update={setEmbedding}
      advertisedModels={props.advertisedModels}
      modelsLoading={props.modelsLoading}
      modelsError={props.modelsError}
      modelsTruncated={props.modelsTruncated}
      onRefreshModels={props.onRefreshModels}
      modelControl="select"
      modelCatalog={
        props.settings.embedding.provider === 'local'
          ? [
              {
                value: 'Qwen/Qwen3-Embedding-0.6B',
                label: 'Qwen/Qwen3-Embedding-0.6B',
              },
              {
                value: 'Qwen/Qwen3-Embedding-4B',
                label: 'Qwen/Qwen3-Embedding-4B',
              },
            ]
          : []
      }
    >
      <div class="settings-note">
        <strong>Local service command:</strong>{' '}
        {props.settings.embedding_service_program
          ? `${props.settings.embedding_service_program} (managed in config.toml)`
          : 'automatic command derived from the model and loopback endpoint'}
        . Desktop preserves explicit executable commands but does not edit shell command arrays.
      </div>
      <FieldGroup columns={2}>
        <NumberField
          label="Vector dimension"
          value={props.settings.embedding.dimension}
          min={1}
          max={65536}
          onChange={(dimension) =>
            setEmbedding({
              ...props.settings.embedding,
              dimension,
            })
          }
        />
        <NumberField
          label="Cache entries"
          hint="0 disables new embedding-cache writes"
          value={props.settings.embedding.cache_max_entries}
          min={0}
          max={5000000}
          onChange={(cache_max_entries) =>
            setEmbedding({
              ...props.settings.embedding,
              cache_max_entries,
            })
          }
        />
        <NumberField
          label="Request timeout"
          value={props.settings.embedding.request_timeout_seconds}
          min={1}
          max={3600}
          onChange={(request_timeout_seconds) =>
            setEmbedding({
              ...props.settings.embedding,
              request_timeout_seconds,
            })
          }
        />
        <NumberField
          label="Request concurrency"
          value={props.settings.embedding.request_concurrency}
          min={1}
          max={64}
          onChange={(request_concurrency) =>
            setEmbedding({
              ...props.settings.embedding,
              request_concurrency,
            })
          }
        />
        <NumberField
          label="Startup timeout"
          value={props.settings.embedding.startup_timeout_seconds}
          min={1}
          max={3600}
          onChange={(startup_timeout_seconds) =>
            setEmbedding({
              ...props.settings.embedding,
              startup_timeout_seconds,
            })
          }
        />
        <NumberField
          label="Memory limit (MB)"
          value={props.settings.embedding.memory_limit_mb}
          min={256}
          max={262144}
          onChange={(memory_limit_mb) =>
            setEmbedding({
              ...props.settings.embedding,
              memory_limit_mb,
            })
          }
        />
      </FieldGroup>
    </ProviderSection>
  )
}
function ProviderSection<T extends ProviderValue>(incoming: {
  title: string
  description: string
  provider: T
  secrets: DesktopSettings['secrets']
  secretValues: Record<string, string>
  onSecret: (values: Record<string, string>) => void
  clearedSecrets: Set<string>
  onClearSecret: (name: string) => void
  modelCatalog: readonly ModelChoice[]
  /** Provider-advertised models; null when unavailable or stale. */
  advertisedModels: readonly ModelChoice[] | null
  modelsLoading: boolean
  modelsError: string
  modelsTruncated: boolean
  onRefreshModels: () => void
  modelControl?: 'combobox' | 'select'
  update: (provider: T) => void
  children?: JSX.Element
}) {
  const props = mergeProps(
    {
      modelControl: 'combobox',
    },
    incoming
  )
  const confirm = useSettingsConfirm()
  const modelFieldId = createUniqueId()
  const secretFieldId = createUniqueId()
  const secret = () =>
    props.provider.api_key_env
      ? props.secrets.find((item) => item.name === props.provider.api_key_env)
      : undefined
  // Provider-advertised models take precedence while available. Local Qwen
  // presets are the only static catalog because they are Cortana's supported
  // bundled path; cloud and local query model ids must come from the provider
  // or remain explicit custom values rather than aging silently in the UI.
  const activeCatalog = () =>
    props.advertisedModels && props.advertisedModels.length > 0
      ? props.advertisedModels
      : props.modelCatalog
  const catalogValues = () => activeCatalog().map((candidate) => candidate.value)
  // The select mode is derived from the active catalog so a provider refresh
  // can never leave a stale select visible: when the current model is not in
  // the active catalog the custom input is shown with the value preserved.
  // The explicit override remembers only a user's own catalog/custom choice
  // and is cleared whenever the available catalog changes.
  const [explicitModelMode, setExplicitModelMode] = createSignal<'catalog' | 'custom' | null>(null)
  const modelMode = (): 'catalog' | 'custom' =>
    explicitModelMode() ?? (catalogValues().includes(props.provider.model) ? 'catalog' : 'custom')
  const catalogKey = () => catalogValues().join('\u0000')
  const [previousCatalogKey, setPreviousCatalogKey] = createSignal(catalogKey())
  createEffect(() => {
    const key = catalogKey()
    if (key !== previousCatalogKey()) {
      setPreviousCatalogKey(key)
      setExplicitModelMode(null)
    }
  })
  const modelInput = () => (
    <FormField label="Model" controlId={modelFieldId}>
      <Input
        id={modelFieldId}
        aria-label="Model"
        value={props.provider.model}
        onInput={(event) =>
          props.update({
            ...props.provider,
            model: event.target.value,
          })
        }
        required
        maxLength={256}
      />
    </FormField>
  )
  const modelSelect = () => (
    <FormField label="Model" controlId={modelFieldId}>
      <Suspense
        fallback={
          <Input
            id={modelFieldId}
            aria-label="Model catalog"
            value={props.provider.model}
            readOnly
          />
        }
      >
        <ValueCombobox
          id={modelFieldId}
          aria-label="Model catalog"

          value={modelMode() === 'catalog' ? props.provider.model : 'custom'}
          choices={[
            ...activeCatalog(),
            {
              value: 'custom',
              label: 'Custom',
            },
          ]}
          onValueChange={(selected) => {
            if (selected === 'custom') {
              setExplicitModelMode('custom')
              return
            }
            if (catalogValues().includes(selected)) {
              setExplicitModelMode('catalog')
              props.update({
                ...props.provider,
                model: selected,
              })
            } else {
              // Unmatched selections (programmatic or label-based) open the
              // custom field with the current model preserved.
              setExplicitModelMode('custom')
            }
          }}
        />
      </Suspense>
    </FormField>
  )
  const dropdownCatalog = () =>
    catalogValues().includes(props.provider.model)
      ? activeCatalog()
      : [
          {
            value: props.provider.model,
            label: props.provider.model,
          },
          ...activeCatalog(),
        ]
  const modelDropdown = () => (
    <FormField label="Model" controlId={modelFieldId}>
      <NativeSelect
        id={modelFieldId}
        aria-label="Model catalog"
        class="w-full"
        value={props.provider.model}
        required
        onChange={(event) =>
          props.update({
            ...props.provider,
            model: event.target.value,
          })
        }
        options={dropdownCatalog().map((candidate) => ({
          value: candidate.value,
          label: candidate.label,
        }))}
      />
    </FormField>
  )
  const modelControls = (
    <div class="model-field">
      {props.modelControl === 'select'
        ? modelDropdown()
        : modelMode() === 'custom'
          ? modelInput()
          : modelSelect()}
      <div class="model-refresh">
        <ActionButton
          tooltip={`Refresh ${props.title} models from provider`}
          variant="secondary"
          size="sm"
          type="button"
          aria-label={`Refresh ${props.title} models from provider`}
          disabled={props.modelsLoading}
          onClick={props.onRefreshModels}
        >
          {props.modelsLoading ? (
            <Spinner size="sm" label={false} />
          ) : (
            <RefreshCw size={14} aria-hidden="true" />
          )}{' '}
          Refresh models
        </ActionButton>
      </div>
      {props.modelsError && (
        <Alert variant="destructive" role="alert" class="my-2">
          <AlertDescription>{props.modelsError}</AlertDescription>
        </Alert>
      )}
      {props.advertisedModels && props.advertisedModels.length > 0 && (
        <small class="model-note">
          {props.advertisedModels.length} model{props.advertisedModels.length === 1 ? '' : 's'}{' '}
          advertised by the provider{props.modelsTruncated ? ' (first 512 shown)' : ''}. A current
          model that is not advertised stays selected in the custom field.
        </small>
      )}
    </div>
  )
  return (
    <SettingsSection bodyLayout="content" title={props.title} description={props.description}>
      <FieldGroup columns={2}>
        <FormField label="Provider">
          <NativeSelect
            class="w-full"
            value={props.provider.provider}
            onChange={(event) => {
              const nextProvider = event.target.value as 'local' | 'cloud'
              const loopback = isLoopbackUrl(props.provider.base_url)
              const base_url =
                nextProvider === 'cloud' && loopback
                  ? 'https://api.openai.com/v1'
                  : nextProvider === 'local' && !loopback
                    ? props.title.startsWith('Embedding')
                      ? 'http://127.0.0.1:6999/v1'
                      : 'http://127.0.0.1:8008/v1'
                    : props.provider.base_url
              props.update({
                ...props.provider,
                provider: nextProvider,
                base_url,
              })
            }}
            options={[
              { value: 'local', label: 'Local' },
              { value: 'cloud', label: 'Cloud' },
            ]}
          />
        </FormField>
        {modelControls}
        <FormField label="OpenAI-compatible endpoint" class="col-span-full">
          <Input
            type="url"
            value={props.provider.base_url}
            onInput={(event) =>
              props.update({
                ...props.provider,
                base_url: event.target.value,
              })
            }
            required
          />
        </FormField>
        <FormField
          label="API key variable"
          hint={
            secret()?.configured && !props.clearedSecrets.has(secret()!.name)
              ? `Configured via ${secret()!.source}`
              : 'Optional for local providers'
          }
        >
          <Input
            value={props.provider.api_key_env || ''}
            onInput={(event) =>
              props.update({
                ...props.provider,
                api_key_env: event.target.value || null,
              })
            }
            pattern="[A-Z_][A-Z0-9_]*"
            placeholder="CORTANA_PROVIDER_API_KEY"
          />
        </FormField>
        <FormField
          label="New API key"
          hint="write-only; leave blank to keep existing"
          controlId={secretFieldId}
        >
          <Suspense
            fallback={
              <Input
                id={secretFieldId}
                aria-label="New API key"
                aria-describedby={`${secretFieldId}-description`}
                type="password"
                autocomplete="new-password"
                value=""
                disabled
              />
            }
          >
            <SecretInputGroup
              id={secretFieldId}
              aria-describedby={`${secretFieldId}-description`}
              value={
                props.provider.api_key_env
                  ? props.secretValues[props.provider.api_key_env] || ''
                  : ''
              }
              disabled={!props.provider.api_key_env}
              onChange={(event) => {
                if (!props.provider.api_key_env) return
                props.onSecret({
                  ...props.secretValues,
                  [props.provider.api_key_env]: (event.target as HTMLInputElement).value,
                })
              }}
              onClear={
                props.provider.api_key_env &&
                secret()?.configured &&
                !props.clearedSecrets.has(secret()!.name)
                  ? () =>
                      applyConfirmed(
                        confirm(
                          'Clear the stored provider API key? The change remains a draft until you save settings.'
                        ),
                        () => props.onClearSecret(props.provider.api_key_env!)
                      )
                  : undefined
              }
            />
          </Suspense>
        </FormField>
      </FieldGroup>
      {props.children}
    </SettingsSection>
  )
}
export function QuerySection(incoming: {
  settings: DesktopSettings
  secrets: DesktopSettings['secrets']
  secretValues: Record<string, string>
  onSecret: (values: Record<string, string>) => void
  clearedSecrets: Set<string>
  onClearSecret: (name: string) => void
  update: (change: (draft: DesktopSettings) => DesktopSettings) => void
  advertisedModels: readonly ModelChoice[] | null
  modelsLoading: boolean
  modelsError: string
  modelsTruncated: boolean
  onRefreshModels: () => void
}) {
  const props = incoming
  const setQuery = (query: DesktopSettings['query']) =>
    props.update((current) => ({
      ...current,
      query,
    }))
  return (
    <ProviderSection
      title="Query and answer model"
      description="Retrieval always works locally. Enable synthesis to create grounded answers with citations."
      provider={props.settings.query}
      secrets={props.secrets}
      secretValues={props.secretValues}
      onSecret={props.onSecret}
      clearedSecrets={props.clearedSecrets}
      onClearSecret={props.onClearSecret}
      update={setQuery}
      advertisedModels={props.advertisedModels}
      modelsLoading={props.modelsLoading}
      modelsError={props.modelsError}
      modelsTruncated={props.modelsTruncated}
      onRefreshModels={props.onRefreshModels}
      modelControl="select"
      modelCatalog={[]}
    >
      <SettingsRow
        label="Grounded answer synthesis"
        description="Uses retrieved evidence and validates citation indices before returning an answer."
      >
        <Switch
          aria-label="Enable answer synthesis"
          checked={props.settings.query.synthesis_enabled}
          onChange={(checked: boolean) =>
            setQuery({
              ...props.settings.query,
              synthesis_enabled: checked,
            })
          }
        />
      </SettingsRow>
      <FieldGroup columns={2}>
        <NumberField
          label="Planned queries"
          value={props.settings.query.max_planned_queries}
          min={1}
          max={8}
          onChange={(max_planned_queries) =>
            setQuery({
              ...props.settings.query,
              max_planned_queries,
            })
          }
        />
        <NumberField
          label="Retrieval candidates"
          value={props.settings.query.retrieval_limit}
          min={1}
          max={100}
          onChange={(retrieval_limit) =>
            setQuery({
              ...props.settings.query,
              retrieval_limit,
            })
          }
        />
        <NumberField
          label="Evidence results"
          value={props.settings.query.result_limit}
          min={1}
          max={50}
          onChange={(result_limit) =>
            setQuery({
              ...props.settings.query,
              result_limit,
            })
          }
        />
        <NumberField
          label="Context tokens"
          value={props.settings.query.context_tokens}
          min={256}
          max={131072}
          onChange={(context_tokens) =>
            setQuery({
              ...props.settings.query,
              context_tokens,
            })
          }
        />
        <NumberField
          label="Output tokens"
          value={props.settings.query.output_tokens}
          min={64}
          max={32768}
          onChange={(output_tokens) =>
            setQuery({
              ...props.settings.query,
              output_tokens,
            })
          }
        />
        <NumberField
          label="Request timeout"
          value={props.settings.query.request_timeout_seconds}
          min={1}
          max={600}
          onChange={(request_timeout_seconds) =>
            setQuery({
              ...props.settings.query,
              request_timeout_seconds,
            })
          }
        />
        <NumberField
          label="Answer timeout"
          value={props.settings.query.answer_timeout_seconds}
          min={1}
          max={600}
          onChange={(answer_timeout_seconds) =>
            setQuery({
              ...props.settings.query,
              answer_timeout_seconds,
            })
          }
        />
        <NumberField
          label="Request concurrency"
          value={props.settings.query.request_concurrency}
          min={1}
          max={32}
          onChange={(request_concurrency) =>
            setQuery({
              ...props.settings.query,
              request_concurrency,
            })
          }
        />
        <NumberField
          label="Cache entries"
          hint="0 disables new answer-cache writes"
          value={props.settings.query.cache_max_entries}
          min={0}
          max={1000000}
          onChange={(cache_max_entries) =>
            setQuery({
              ...props.settings.query,
              cache_max_entries,
            })
          }
        />
        <NumberField
          label="Cache lifetime (seconds)"
          hint="0 disables answer-cache reads"
          value={props.settings.query.cache_ttl_seconds}
          min={0}
          max={604800}
          onChange={(cache_ttl_seconds) =>
            setQuery({
              ...props.settings.query,
              cache_ttl_seconds,
            })
          }
        />
      </FieldGroup>
    </ProviderSection>
  )
}
