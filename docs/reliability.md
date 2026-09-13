# Reliability and recovery contracts

Measurable reliability, recovery, and observability contracts for Cortana's shipped profiles —
Local, Self-hosted single-node, and the synchronized/fleet cores from ADRs 0003–0005 — before any
production availability claim. Companion to [Operations](operations.md), which owns procedures;
this document owns targets, budgets, and the chaos catalog. It never mirrors milestone status.

## Service objectives and error budgets

Objectives are measured at the public API surface with the privacy rules below. A surface without
retained evidence has no production claim: **broader production rollout stays blocked until the
hosted-runtime evidence lands (#2312)**, per the error-budget rule at the end of this section.

| Surface                                   | Objective                                                          | Error budget (28 d)        | Evidence today                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Query (lexical + fused retrieval)         | p95 ≤ 5 s; hard cap 30 s per request                               | 1 % failed/budget-exceeded | Deterministic eval gates (`cortana eval --knowledge --offline`); live-index manifest bounds (max_latency_ms 30000) |
| Context build (bounded inclusion)         | p95 ≤ 5 s; 100 % citation validity against returned evidence       | 1 %                        | Context eval thresholds (min_context_pass_rate 0.8, min_citation_validity 1.0)                                     |
| Memory remember/recall/forget             | p95 ≤ 1 s local; zero ACL leaks                                    | 0.1 %                      | Memory eval bounds (5 s p95, 2 GiB RSS, zero-exposure gates)                                                       |
| Sync bundle apply                         | 100 % atomic; zero partial-application commits                     | 0 % (correctness)          | Atomicity + idempotence + conflict tests (#2309/#2310)                                                             |
| Fleet grant verify / result open          | 100 % reject expired, revoked, tampered                            | 0 % (correctness)          | Fleet tests (#2311)                                                                                                |
| Backup creation                           | 100 % of scheduled backups verify; age ≤ 48 h                      | 0 missed windows           | `cortana readiness --max-backup-age-hours 48`; verify/restore drills (Operations)                                  |
| Restore                                   | RTO ≤ 30 min for self-hosted single node; 100 % restore-drill pass | 0 failed drills            | Restore procedures (Operations)                                                                                    |
| Update                                    | 100 % signature/checksum verification; rollback available          | 0 unverified installs      | Release asset verification workflows                                                                               |
| Control (auth reload, admin, sync status) | p95 ≤ 1 s                                                          | 1 %                        | API tests                                                                                                          |

Correctness surfaces (sync apply, fleet verification, backup verification) carry zero-tolerance
budgets: any failure is a stop-ship defect, not budgeted downtime.

## Durability, recovery, and deletion

- **RPO**: committed canonical changes survive power/host loss up to the last verified backup.
  Owner-set backup cadence with a 48-hour maximum staleness alert; the sync journal adds
  device-level RPO only when bundles are exchanged, and the relay does not exist yet (#2312).
- **RTO**: self-hosted single node restores from verified backup within 30 minutes on the
  documented hardware baseline; the restore drill is the evidence.
- **Backup integrity**: backups are verified (`cortana verify`) before trust and must pass a
  restore drill before being relied on; an unverified backup is not a backup.
- **Key recovery**: account identity material is sealed under the owner recovery key (ADR 0004).
  Loss of the recovery key and every enrolled device is permanent by design; documented at
  generation time. Key recovery is therefore an owner procedure, not a service promise.
- **Tenant restore** (future hosted profiles): per-tenant isolation boundaries require
  per-tenant restore with purge evidence; defined in ADR 0003, evidence deferred with #2312.
- **Deletion**: owner-initiated forget/forget-memory is immediate and authoritative locally;
  fleet and synchronized copies terminate at tombstones with explicit historical-access
  semantics (ADR 0003/0004) — deletion propagates, retroactive remote erasure is never claimed.

## Observability

Metrics, traces, logs, and audit events carry principal labels, operation, scope labels,
outcome, bounded counts, and latency — never query text, document or memory content, tokens,
credentials, or private absolute paths (enforced by `cortana.security.v1` audit rules and tests).
Alert-worthy signals: backup age/verification failure, restore-drill failure, sync conflict-queue
growth, fleet grant-verification rejections, readiness probe failure, error-budget burn.
Dashboards and on-call runbooks are hosted-profile deliverables (#2312); local operators get the
same signals through `readiness`, `sync-bundle status`, audit export, and metrics.

## Chaos catalog

Each scenario maps to its standing evidence; unexecuted rows are drill obligations before any
hosted rollout, not aspirations.

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
| Host/regional failure (hosted) | Drill required before rollout — no standing evidence (#2312)                           |
| Database failover (hosted)     | Drill required before rollout — no standing evidence (#2312)                           |

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
next production rollout step (new hosted profile, fleet expansion, public availability claim)
until the failure is explained, fixed, and re-evidenced. This gate is the reliability half of the
ADR 0005 review boundary.
