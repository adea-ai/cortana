//! Boundary parsers for the highest-traffic server and desktop responses.
//!
//! Complements `graphResponse.ts`: each parser validates the envelope and the
//! fields the render path branches on, so a malformed payload (proxy error
//! page, envelope drift, partial object) throws `ResponseShapeError` at the
//! boundary instead of crashing the render tree with `undefined` reads.

import type {
  AgentMemory,
  AnswerResponse,
  CandidatePage,
  ContextBundle,
  BrainDocument,
  BrainDocumentPage,
  BrainDocumentSummary,
  BrainStatus,
  DerivedMemoryResponse,
  DesktopUpdate,
  MemoryCandidateActionResult,
  MemoryCandidateClassification,
  ReflectResponse,
} from './types'
import {
  assertArray,
  assertRecord,
  ResponseShapeError,
  optionalNumber,
  optionalString,
  requireBoolean,
  requireLiteral,
  requireNumber,
  requireString,
} from './responseValidation'

const UPDATE_PHASES = [
  'idle',
  'checking',
  'current',
  'unavailable',
  'available',
  'downloading',
  'installing',
  'cancelling',
  'cancelled',
  'installed',
  'failed',
] as const

function parseDocumentSummary(value: unknown, label: string): BrainDocumentSummary {
  const record = assertRecord(value, label)
  return {
    id: requireString(record, 'id', label),
    source: requireString(record, 'source', label),
    source_id: requireString(record, 'source_id', label),
    title: requireString(record, 'title', label),
    uri: optionalString(record, 'uri', label),
    updated_at: requireString(record, 'updated_at', label),
    project: requireString(record, 'project', label),
    chunk_count: requireNumber(record, 'chunk_count', label),
    content_chars: requireNumber(record, 'content_chars', label),
  }
}

export function parseBrainStatus(value: unknown): BrainStatus {
  const record = assertRecord(value, 'Status')
  const query = assertRecord(record['query'], 'Status query')
  const ingestion = assertRecord(record['ingestion'], 'Status ingestion')
  requireString(ingestion, 'mode', 'Status')
  const memory = assertRecord(record['memory'], 'Status memory')
  assertArray(record['sources'], 'Status', 'sources')
  assertArray(record['sync_runs'], 'Status', 'sync_runs')
  assertArray(record['workspaces'], 'Status', 'workspaces')
  requireLiteral(query, 'mode', ['extractive', 'synthesized'], 'Status')
  requireNumber(memory, 'active', 'Status')
  return value as BrainStatus
}

export function parseCandidatePage(value: unknown): CandidatePage {
  const record = assertRecord(value, 'Memory candidates')
  const candidates = assertArray(record['candidates'], 'Memory candidates', 'candidates')
  for (const candidate of candidates) assertRecord(candidate, 'Memory candidates entry')
  requireBoolean(record, 'truncated', 'Memory candidates')
  return value as CandidatePage
}

export function parseBrainDocumentPage(value: unknown): BrainDocumentPage {
  const record = assertRecord(value, 'Document list')
  const documents = assertArray(record['documents'], 'Document list', 'documents')
  for (const entry of documents) parseDocumentSummary(entry, 'Document list entry')
  if (record['next_cursor'] !== null && typeof record['next_cursor'] !== 'string') {
    throw new ResponseShapeError('Document list', 'next_cursor must be a string or null')
  }
  return value as BrainDocumentPage
}

export function parseBrainDocument(value: unknown): BrainDocument {
  const record = assertRecord(value, 'Document')
  parseDocumentSummary(value, 'Document')
  requireString(record, 'content', 'Document')
  assertRecord(record['metadata'], 'Document metadata')
  assertArray(record['acl'], 'Document', 'acl')
  assertArray(record['backlinks'], 'Document', 'backlinks')
  assertArray(record['surrounding'], 'Document', 'surrounding')
  requireBoolean(record, 'truncated', 'Document')
  return value as BrainDocument
}

export function parseAnswerResponse(value: unknown): AnswerResponse {
  const record = assertRecord(value, 'Answer')
  requireString(record, 'query', 'Answer')
  requireString(record, 'answer', 'Answer')
  assertArray(record['evidence'], 'Answer', 'evidence')
  const plan = assertRecord(record['plan'], 'Answer plan')
  assertArray(plan['queries'], 'Answer plan', 'queries')
  requireBoolean(plan, 'model_generated', 'Answer')
  requireLiteral(record, 'mode', ['extractive', 'synthesized'], 'Answer')
  requireBoolean(record, 'cached', 'Answer')
  requireNumber(record, 'latency_ms', 'Answer')
  assertArray(record['warnings'], 'Answer', 'warnings')
  return value as AnswerResponse
}

export function parseContextBundle(value: unknown): ContextBundle {
  const record = assertRecord(value, 'Context bundle')
  requireString(record, 'query', 'Context bundle')
  requireString(record, 'context', 'Context bundle')
  assertArray(record['evidence'], 'Context bundle', 'evidence')
  const metrics = assertRecord(record['metrics'], 'Context bundle metrics')
  requireNumber(metrics, 'included', 'Context bundle')
  return value as ContextBundle
}

export function parseReflectResponse(value: unknown): ReflectResponse {
  const record = assertRecord(value, 'Reflection')
  requireString(record, 'contract_version', 'Reflection')
  requireString(record, 'request_digest', 'Reflection')
  requireLiteral(
    record,
    'status',
    ['completed', 'fallback', 'provider_unavailable', 'provider_failed', 'deadline_exceeded'],
    'Reflection'
  )
  requireString(record, 'objective', 'Reflection')
  requireNumber(record, 'memory_revision', 'Reflection')
  const provider = assertRecord(record['provider'], 'Reflection provider')
  requireLiteral(
    provider,
    'policy',
    ['deterministic-only', 'prefer-provider', 'require-provider'],
    'Reflection'
  )
  assertArray(record['claims'], 'Reflection', 'claims')
  return value as ReflectResponse
}

export function parseMemoryCandidateClassification(value: unknown): MemoryCandidateClassification {
  const record = assertRecord(value, 'Candidate classification')
  requireString(record, 'candidate_id', 'Candidate classification')
  requireString(record, 'classification', 'Candidate classification')
  requireNumber(record, 'confidence', 'Candidate classification')
  assertArray(record['supporting_memory_ids'], 'Candidate classification', 'supporting_memory_ids')
  requireString(record, 'explanation', 'Candidate classification')
  return value as MemoryCandidateClassification
}

export function parseMemoryCandidateActionResult(value: unknown): MemoryCandidateActionResult {
  const record = assertRecord(value, 'Candidate action')
  requireString(record, 'status', 'Candidate action')
  const decision = record['decision']
  if (decision !== null && decision !== undefined) {
    const decisionRecord = assertRecord(decision, 'Candidate action decision')
    requireString(decisionRecord, 'decision', 'Candidate action')
    requireString(decisionRecord, 'classification', 'Candidate action')
  }
  return value as MemoryCandidateActionResult
}

export function parseDerivedMemoryResponse(value: unknown): DerivedMemoryResponse {
  const record = assertRecord(value, 'Derived memory')
  requireString(record, 'contract_version', 'Derived memory')
  requireNumber(record, 'memory_revision', 'Derived memory')
  const representations = assertArray(
    record['representations'],
    'Derived memory',
    'representations'
  )
  for (const entry of representations) {
    const representation = assertRecord(entry, 'Derived representation')
    requireString(representation, 'id', 'Derived representation')
    requireNumber(representation, 'confidence', 'Derived representation')
  }
  return value as DerivedMemoryResponse
}

export function parseAgentMemories(value: unknown): AgentMemory[] {
  const memories = assertArray(value, 'Memories', 'items')
  for (const entry of memories) {
    const record = assertRecord(entry, 'Memory entry')
    requireString(record, 'id', 'Memory entry')
    requireString(record, 'project', 'Memory entry')
    requireString(record, 'content', 'Memory entry')
  }
  return value as AgentMemory[]
}

export function parseDesktopUpdate(value: unknown): DesktopUpdate {
  const record = assertRecord(value, 'Update status')
  requireString(record, 'current_version', 'Update status')
  optionalString(record, 'available_version', 'Update status')
  requireLiteral(record, 'phase', UPDATE_PHASES, 'Update status')
  requireNumber(record, 'downloaded_bytes', 'Update status')
  optionalNumber(record, 'total_bytes', 'Update status')
  optionalString(record, 'error', 'Update status')
  requireBoolean(record, 'restart_required', 'Update status')
  return value as DesktopUpdate
}
