# Reliability and recovery contracts

Reliability, recovery, and observability targets for Cortana's Local and Self-hosted single-node
deployment profiles. The repository implements sync-bundle, device-identity, relay, and fleet-grant
logic. ADR 0008 defines the opt-in, owner-operated relay path for cross-device sync; the fleet-grant
code does not establish a supported remote-executor deployment. ADRs 0003–0005 define the wider
profile boundaries. This document defines targets, budgets, and the chaos catalog; [Operations](operations.md)
owns procedures, and GitHub owns current milestone status. These targets do not establish a
production availability claim without the evidence listed below.

## Service objectives and error budgets

Objectives are measured at the public API surface with the privacy rules below. A surface without
retained evidence has no production claim. ADR 0008 keeps the product local-only and self-operated,
so hosted-runtime and remote-fleet scenarios below are conditional design targets, not current
rollout gates. They would require a new owner decision and profile-specific evidence plan.

| Surface                                   | Objective                                                          | Error budget (28 d)        | Evidence today                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Query (lexical + fused retrieval)         | p95 ≤ 5 s; hard cap 30 s per request                               | 1 % failed/budget-exceeded | Deterministic eval gates (`cortana eval --knowledge --offline`); live-index manifest bounds (max_latency_ms 30000) |
| Context build (bounded inclusion)         | p95 ≤ 5 s; 100 % citation validity against returned evidence       | 1 %                        | Context eval thresholds (min_context_pass_rate 0.8, min_citation_validity 1.0)                                     |
| Memory remember/recall/forget             | p95 ≤ 1 s local; zero ACL leaks                                    | 0.1 %                      | Memory eval bounds (5 s p95, 2 GiB RSS, zero-exposure gates)                                                       |
| Sync bundle apply                         | 100 % atomic; zero partial-application commits                     | 0 % (correctness)          | Atomicity + idempotence + conflict tests (#2309/#2310)                                                             |
| Fleet-grant verification contract         | Reject expired, revoked, or tampered grants                        | 0 % (correctness)          | Fleet tests (#2311); no remote-executor deployment in current scope                                                |
| Backup creation                           | 100 % of scheduled backups verify; age ≤ 48 h                      | 0 missed windows           | `cortana readiness --max-backup-age-hours 48`; verify/restore drills (Operations)                                  |
| Restore                                   | RTO ≤ 30 min for self-hosted single node; 100 % restore-drill pass | 0 failed drills            | Restore procedures (Operations)                                                                                    |
| Update                                    | 100 % signature/checksum verification; rollback available          | 0 unverified installs      | Release asset verification workflows                                                                               |
| Control (auth reload, admin, sync status) | p95 ≤ 1 s                                                          | 1 %                        | API tests                                                                                                          |

Correctness surfaces (sync apply, fleet verification, backup verification) carry zero-tolerance
budgets: any failure is a stop-ship defect, not budgeted downtime.

## Durability, recovery, and deletion

- **RPO**: committed canonical changes survive power/host loss up to the last verified backup.
  Owner-set backup cadence with a 48-hour maximum staleness alert; the sync journal adds
  device-level RPO only when bundles are exchanged. The opt-in relay provides transport for those
  exchanges; it does not provide a managed synchronization service.
- **RTO**: self-hosted single node restores from verified backup within 30 minutes on the
  documented hardware baseline; the restore drill is the evidence.
- **Backup integrity**: backups are verified (`cortana verify`) before trust and must pass a
  restore drill before being relied on; an unverified backup is not a backup.
- **Key recovery**: account identity material is sealed under the owner recovery key (ADR 0004).
  Loss of the recovery key and every enrolled device is permanent by design; documented at
  generation time. Key recovery is therefore an owner procedure, not a service promise.
- **Tenant restore** (only if hosted scope returns): per-tenant isolation boundaries require
  per-tenant restore with purge evidence, as defined in ADR 0003.
- **Deletion**: owner-initiated forget/forget-memory is immediate and authoritative locally.
  Sync bundles propagate deletion as tombstones with explicit historical-access semantics (ADRs
  0003 and 0004). The fleet-grant contract does not establish a remote executor deployment.
  Deletion cannot retroactively erase data already delivered to another device.

## Observability

Metrics, traces, logs, and audit events carry principal labels, operation, scope labels,
outcome, bounded counts, and latency. They never carry query text, document or memory content, tokens,
credentials, or private absolute paths (enforced by `cortana.security.v1` audit rules and tests).
Alert-worthy signals: backup age/verification failure, restore-drill failure, sync conflict-queue
growth, fleet grant-verification rejections, readiness probe failure, error-budget burn.
Local operators get these signals through `readiness`, `sync-bundle status`, audit export, and
metrics. Hosted dashboards and on-call runbooks would require a new owner decision to resume that
deployment scope.

## Chaos catalog

Each current-profile scenario maps to standing evidence. The hosted failure scenarios are
conditional targets; they do not become rollout gates unless hosted operation returns to scope
under a new owner decision.

| Scenario                       | Standing evidence or drill                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Partial/corrupt sync transfer  | Atomic-apply and tamper-rejection tests (#2309); ack-only-advances test                |
| Duplicate delivery             | Idempotence tests (#2309); token-id binding (#2311)                                    |
| Device/credential compromise   | Revocation + wipe tests (#2304); revoked-issuer test (#2311)                           |
| Concurrent edit conflicts      | Deterministic-resolution convergence tests (#2309)                                     |
| Provider outage                | Embedding/query fallback tests; bounded fallback rates in eval gates                   |
| Corrupt derived index          | Rebuildable-projection tests (code intelligence); chunk invalidation on import (#2309) |
| Store lock contention          | Busy-timeout optional-write discipline (store tests)                                   |
| Failed/expired fleet job       | Expiry + audience tests (#2311); deletion authority structurally absent                |
| Backup media loss              | Maintain ≥ 2 verified backups on separate volumes (Operations)                         |
| Host/regional failure (hosted) | Conditional hosted target; no deployment in current scope                              |
| Database failover (hosted)     | Conditional hosted target; no deployment in current scope                              |

## Capacity, degradation, and maintenance

Resource bounds are explicit and enforced rather than aspirational: ingestion preflight bounds
(25 documents / 5 MiB / 60 s defaults), eval resource ceilings (60 CPU s, 2 GiB peak RSS, 5 s p95
latency, 16 provider requests, $1 estimated cost), live-index request/total budgets
(30 s/300 s, 1 GiB memory, 100 cases), and the self-hosted baseline (2 CPUs, 2 GiB, durable
volume sized at 20 GiB plus three times the canonical database). Degradation is explicit:
provider loss falls back to lexical retrieval, unavailable embedding providers fail bounded,
sync peers stall instead of overwriting (split-brain stops with a report), and fleet executors
without a valid grant do nothing. Maintenance requires drain semantics already supported by the
identity registry (revoke → drain → wipe); database maintenance follows Operations' backup,
verify, restore sequence.

## Error-budget rule

A surface that exhausts its budget, or any zero-tolerance correctness failure above, blocks the
next production release of the affected current profile until the failure is explained, fixed, and
re-evidenced. Hosted operation and remote fleet deployment remain outside scope under ADR 0008; a
new owner decision must define their reliability evidence before either can be considered for
rollout. This gate is the reliability half of the ADR 0005 review boundary.
