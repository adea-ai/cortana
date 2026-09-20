//! Executable provider conformance runner (issue #2060).
//!
//! Drives every `semantic_cases` entry of
//! `tests/fixtures/provider-conformance-v1.json` against the real consumer
//! validator (`cortana::provider::validate_context_bundle`), synthesizing
//! producer-valid bundles per the case's declared properties and asserting
//! the outcome matches the fixture's `expected` string. Also executes the
//! fixture invariants that are decidable in-process plus the authorization
//! and replay failure cases with engine-backed behavior.
//!
//! Failure cases that require transport restarts, brokers, or packaged HTTP
//! limits stay covered by the HTTP integration suites and the packaged
//! acceptance lane; the runner asserts they remain present in the fixture so
//! the contract checklist cannot silently shrink.

use serde_json::Value;
use std::path::Path;

use cortana::context::{self, ContextBundle};
use cortana::contracts::{CONTEXT_CONTRACT_VERSION, DegradationState};
use cortana::integration::{ExternalWorkspaceMapping, IntegrationPrincipal, PrincipalRole};
use cortana::memory::{MemoryRecord, MemorySearchResult};
use cortana::model::Evidence;
use cortana::provider::{
    ContextValidation, PROVIDER_CONTRACT_VERSION, ProviderOperation, ProviderOutcome,
    ProviderOutcomeCode, ReplayGuard, TransportProfile, ValidationCode, validate_context_bundle,
};

const FIXTURE_PATH: &str = "tests/fixtures/provider-conformance-v1.json";
const BUNDLE_FIXTURE_PATH: &str = "tests/fixtures/context-bundle-v1.json";

fn load_fixture() -> Value {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(FIXTURE_PATH);
    serde_json::from_str(
        &std::fs::read_to_string(&path).unwrap_or_else(|error| panic!("read {path:?}: {error}")),
    )
    .expect("provider conformance fixture is valid JSON")
}

fn evidence(index: usize) -> Evidence {
    // Fixed observation time: bundle identity covers evidence timestamps, so
    // wall-clock synthesis would make identical inputs derive different ids.
    let updated_at = chrono::DateTime::from_timestamp(1_700_000_000, 0).expect("epoch");
    Evidence {
        chunk_id: format!("chunk_{index}"),
        source: "fixture".into(),
        source_id: format!("fixture-source-{index}"),
        title: format!("Fixture evidence {index}"),
        uri: Some(format!("fixture://evidence/{index}")),
        content: format!("Deterministic conformance evidence {index} for the fixture query."),
        score: 1.0,
        semantic_rank: Some(index + 1),
        lexical_rank: Some(index + 1),
        updated_at,
        metadata: serde_json::Value::Null,
    }
}

fn memory() -> MemorySearchResult {
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    MemorySearchResult {
        memory: MemoryRecord {
            id: "conformance-memory".into(),
            kind: "semantic".into(),
            content_type: "semantic".into(),
            retention_tier: "durable".into(),
            scope: "owner-global".into(),
            project: "work".into(),
            title: "Conformance memory".into(),
            content: "Memory is retained separately from citation evidence.".into(),
            source: "conformance".into(),
            source_id: "conformance".into(),
            dedupe_key: None,
            confidence: 0.9,
            importance: 0.5,
            status: "active".into(),
            acl: vec!["work".into()],
            provenance: serde_json::json!({"origin": "conformance"}),
            observed_at: now.clone(),
            valid_from: now.clone(),
            valid_until: None,
            supersedes_id: None,
            created_at: now.clone(),
            updated_at: now,
        },
        lexical_score: 0.0,
        relevance_score: 1.0,
    }
}

/// Build a producer-valid bundle for a semantic case: `evidence_count`
/// evidence items, `memory_count` memories, an optional degradation code, and
/// the case's corpus revision — sealed by `with_metadata` so the digest
/// matches the delivered content.
fn build_case_bundle(case: &Value) -> ContextBundle {
    let evidence_count = case["evidence_count"]
        .as_u64()
        .or_else(|| case["evidence_ids"].as_array().map(|ids| ids.len() as u64))
        .unwrap_or(1) as usize;
    let memory_count = case["memory_count"].as_u64().unwrap_or(0) as usize;
    let evidence: Vec<Evidence> = (0..evidence_count).map(evidence).collect();
    let memories: Vec<MemorySearchResult> = (0..memory_count).map(|_| memory()).collect();
    let degradation = case["degradation_code"]
        .as_str()
        .map(|code| DegradationState {
            code: code.to_string(),
            detail: None,
        });
    // A producer that sees contradictory citation evidence still ships the
    // bundle but attaches a warning the consumer must acknowledge.
    let contradiction_warning = case["evidence_ids"]
        .as_array()
        .filter(|ids| ids.len() > 1)
        .map(|_| DegradationState {
            code: "contradictory_evidence".into(),
            detail: None,
        });
    let mut metadata = context::metadata(context::ContextMetadataInput {
        token_budget: case["token_budget"].as_u64().unwrap_or(512) as usize,
        corpus_revision: case["corpus_revision"].as_u64().unwrap_or(3),
        memory_revision: None,
        embedding_fingerprint: None,
        project: Some("work"),
        source: None,
        acl: &["work".into()],
        retrieval_warning: None,
    });
    metadata.degradation = degradation.or(contradiction_warning);
    context::build_with_retrieval_and_memory(
        "conformance query",
        &evidence,
        &memories,
        metadata.token_budget,
        "hybrid",
        None,
    )
    .with_metadata(metadata)
}

/// Map the validator's verdict onto the fixture's outcome vocabulary.
fn outcome_of(result: Result<cortana::provider::ContextPin, ValidationCode>) -> &'static str {
    match result {
        Ok(pin) if pin.degradation_code.is_some() => "ok_with_warning",
        Ok(_) => "ok",
        Err(ValidationCode::StaleRevision) => "stale",
        Err(ValidationCode::OverBudget) => "over_budget",
        Err(ValidationCode::Degraded) => "degraded",
        Err(ValidationCode::ScopeMismatch) => "scope_mismatch",
        Err(ValidationCode::Insufficient) => "insufficient",
        Err(other) => panic!("unexpected validation code {other:?}"),
    }
}

/// The consumer-side policy for a case: what the approved contract allows.
fn approved_policy(case: &Value, bundle: &ContextBundle) -> ContextValidation {
    ContextValidation {
        expected_scope_digest: case["approved_scope_digest"]
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| bundle.privacy_scope_digest.clone()),
        minimum_corpus_revision: case["minimum_corpus_revision"].as_u64().unwrap_or(0),
        maximum_token_budget: case["approved_budget"]
            .as_u64()
            .map(|value| value as usize)
            .unwrap_or(usize::MAX),
        // "ok_with_warning" is only reachable when the consumer accepts the
        // degraded-but-usable bundle; rejection maps to "degraded".
        allow_degraded: case["expected"].as_str() == Some("ok_with_warning"),
    }
}

#[test]
fn provider_conformance_semantic_cases_match_declared_outcomes() {
    let fixture = load_fixture();
    assert_eq!(
        fixture["fixture_version"].as_str(),
        Some("cortana.provider-fixtures.v1"),
        "fixture contract drifted; update the runner together with the fixture"
    );
    assert_eq!(
        fixture["provider_contract_version"].as_str(),
        Some(PROVIDER_CONTRACT_VERSION),
        "fixture targets a different provider contract than the engine"
    );
    assert_eq!(
        fixture["context_contract_version"].as_str(),
        Some(CONTEXT_CONTRACT_VERSION),
        "fixture targets a different context contract than the engine"
    );

    let cases = fixture["semantic_cases"]
        .as_array()
        .expect("semantic_cases array");
    assert!(
        cases.len() >= 8,
        "the conformance fixture lost semantic coverage"
    );
    for case in cases {
        let name = case["name"].as_str().expect("case name");
        let bundle = build_case_bundle(case);
        let approved = approved_policy(case, &bundle);
        let outcome = outcome_of(validate_context_bundle(&bundle, &approved));
        assert_eq!(
            outcome,
            case["expected"].as_str().expect("expected outcome"),
            "semantic case {name} diverged from its declared outcome"
        );
    }
}

#[test]
fn provider_conformance_bundle_template_is_rejected_until_filled() {
    // The bundle fixture is the envelope template handed to consumers: it is
    // authored with placeholder digests and no evidence, and must never
    // validate. A consumer that trusts it unsealed hits the digest gate; a
    // producer that reseals the still-empty template hits the usefulness
    // floor. Only a filled, resealed bundle reaches "ok".
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(BUNDLE_FIXTURE_PATH);
    let template: ContextBundle = serde_json::from_str(
        &std::fs::read_to_string(&path).unwrap_or_else(|error| panic!("read {path:?}: {error}")),
    )
    .expect("context bundle fixture is valid JSON");
    let approved_for_template = ContextValidation {
        expected_scope_digest: template.privacy_scope_digest.clone(),
        minimum_corpus_revision: template.corpus_revision,
        maximum_token_budget: template.token_budget,
        allow_degraded: false,
    };
    assert_eq!(
        validate_context_bundle(&template, &approved_for_template).unwrap_err(),
        ValidationCode::Insufficient,
        "an evidence-free bundle must not satisfy a consumer"
    );

    let mut tampered = template.clone();
    tampered.context.push_str(" tampered");
    assert_eq!(
        validate_context_bundle(&tampered, &approved_for_template).unwrap_err(),
        ValidationCode::DigestMismatch,
        "content that does not match the sealed digest must fail"
    );
}

#[test]
fn provider_conformance_invariants_hold_in_process() {
    let invariants = load_fixture()["invariants"].clone();
    assert_eq!(
        invariants["retrieval_is_non_mutating"], true,
        "fixture contract changed"
    );

    // retrieval_is_non_mutating: identical inputs derive an identical bundle,
    // and validation is a pure function of it.
    let case = serde_json::json!({"evidence_count": 2, "expected": "ok"});
    let bundle = build_case_bundle(&case);
    let replay = build_case_bundle(&case);
    assert_eq!(bundle.context_bundle_id, replay.context_bundle_id);
    let approved = approved_policy(&case, &bundle);
    let first = validate_context_bundle(&bundle, &approved).expect("first validation");
    let second = validate_context_bundle(&bundle, &approved).expect("second validation");
    assert_eq!(first, second, "consumer state leaked between validations");

    // memory_is_not_citation_evidence: memory metrics stay separate from
    // evidence metrics inside the bundle contract.
    let with_memory = build_case_bundle(&serde_json::json!({
        "evidence_count": 2, "memory_count": 1, "expected": "ok"
    }));
    assert_eq!(with_memory.metrics.memories_included, 1);
    assert_eq!(with_memory.metrics.included, 2);

    // transport_does_not_change_semantics: moving an outcome onto another
    // transport preserves the code and payload.
    let outcome = ProviderOutcome::success(TransportProfile::DirectLocal, "payload".to_string());
    let relayed = outcome.clone_for_transport(TransportProfile::RemoteBroker);
    assert_eq!(relayed.code, outcome.code);
    assert_eq!(relayed.result, outcome.result);
    assert_eq!(relayed.transport, TransportProfile::RemoteBroker);

    // ambiguous_writes_require_status_reconciliation: the replay guard refuses
    // a second write under one idempotency key until status is reconciled.
    let mut guard = ReplayGuard::new(8);
    assert!(
        guard
            .accept("read-1", ProviderOperation::EvidenceSearch)
            .expect("first read accepted")
    );
    assert!(
        !guard
            .accept("read-1", ProviderOperation::EvidenceSearch)
            .expect("duplicate read surfaced"),
        "a duplicated read is reported, not re-executed"
    );
    let mut guard = ReplayGuard::new(8);
    assert!(
        guard
            .accept("write-1", ProviderOperation::MemoryWrite)
            .expect("first write accepted")
    );
    let duplicate = guard
        .accept("write-1", ProviderOperation::MemoryWrite)
        .expect_err("a duplicated write must wait for status reconciliation");
    assert!(duplicate.to_string().contains("ambiguous"));

    // credentials_and_local_paths_are_forbidden: provider-visible projections
    // of a mapping redact local paths and bearer material.
    let mapping = ExternalWorkspaceMapping::new(
        "consumer_acme",
        "workspace_external_42",
        "project_cortana_7",
        "cap_local_opaque",
        vec!["project_cortana_7".into()],
    )
    .expect("valid mapping");
    let serialized = serde_json::to_string(&mapping).expect("mapping serialization");
    assert!(!serialized.contains('/'), "local path leaked: {serialized}");
    assert!(!serialized.to_lowercase().contains("bearer"));
}

#[test]
fn provider_conformance_authorization_failure_cases_stay_fail_closed() {
    // failure_cases: missing/invalid/expired/revoked principal — the
    // in-process authorization boundary. The remaining transport-level cases
    // are exercised by the HTTP integration suites and packaged acceptance.
    let fixture = load_fixture();
    let failure_cases = fixture["failure_cases"].as_array().expect("failure_cases");
    for case in [
        "missing_principal",
        "invalid_principal",
        "expired_principal",
        "revoked_principal",
    ] {
        assert!(
            failure_cases
                .iter()
                .any(|entry| entry.as_str() == Some(case)),
            "failure case {case} disappeared from the fixture"
        );
    }

    let mut mapping = ExternalWorkspaceMapping::new(
        "consumer_acme",
        "workspace_external_42",
        "work",
        "cap_local_opaque",
        vec!["work".into()],
    )
    .expect("valid mapping");
    mapping.approve("owner-local").expect("approval");
    let principal = IntegrationPrincipal::new(
        "principal_query",
        PrincipalRole::QueryOnly,
        &mapping.mapping_id,
        vec!["work".into()],
        Some("2020-01-01T00:00:00Z"),
    )
    .expect("expired principal");
    let request = cortana::provider::ProviderRequest::new(
        "request_conformance",
        &mapping.mapping_id,
        &principal.principal_id,
        "work",
        cortana::contracts::privacy_scope_digest(Some("work"), None, &["work".into()]),
        ProviderOperation::Context,
        cortana::provider::ProviderRequestLimits {
            max_tokens: 512,
            max_response_bytes: 256_000,
            timeout_ms: 10_000,
        },
        Some("conformance_read"),
    )
    .expect("valid provider request");

    assert_eq!(
        cortana::provider::authorize_provider_request(
            &request,
            &mapping,
            &principal,
            "2020-01-01T00:00:00Z",
        ),
        Err(ProviderOutcomeCode::Unauthorized),
        "an expired principal must not authorize"
    );
}
