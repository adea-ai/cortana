# Managed and multi-device threat model

Companion to [ADR 0003](0003-multi-device-and-managed-modes.md) and the local
[security and trust model](../security-model.md), which it extends but does not replace. This is
the entry-gate threat model for the four future modes; no mode is implemented until its own ADRs
revise this model with measured controls and evidence boundaries.

## Scope and principals

The model covers encrypted personal multi-device, managed personal cloud, shared team brain, and
remote connector fleet as defined in ADR 0003. Principals beyond the local model are the
synchronization relay, the managed operator, the team write coordinator, workspace members,
fleet executor nodes, and a device thief. The relay, operator, coordinator, and executors are
treated as honest-but-curious or compromised by default; no mode may require trusting their
discretion with plaintext content.

## Per-mode trust boundaries

| Mode                            | Canonical writer              | Plaintext key boundary                                           | Consent boundary                                               |
| ------------------------------- | ----------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| Encrypted personal multi-device | Owner-designated primary node | Owner devices only; relay is ciphertext-only                     | Per-device pairing; revocable per device                       |
| Managed personal cloud          | Hosted per-owner node         | Per-tenant deployment isolation; owner holds content authority   | Explicit per-owner onboarding; local product never requires it |
| Shared team brain               | Server write coordinator      | Per-workspace ACL at coordinator; residency pinned per workspace | Per-workspace member consent; personal brain stays separate    |
| Remote connector fleet          | Owner node (unchanged)        | Owner-node validator; executors stateless                        | Per-task scoped, short-lived credentials                       |

## Threats and required controls

| Threat                             | Modes affected              | Required control                                                                                                                                                                         |
| ---------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relay or server compromise         | multi-device, managed, team | Ciphertext-only relay storage; per-tenant deployment isolation; coordinator holds no member plaintext keys                                                                               |
| Device loss or theft               | multi-device, fleet         | Per-device keys revocable without re-keying the owner; remote unpair; no reusable credentials on device                                                                                  |
| Insider access at operator         | managed, team               | Operator is a distinct principal with metadata-only audit access; content access requires owner-recorded break-glass with notice                                                         |
| Shared membership misuse           | team                        | ACL intersection before every read/write; membership removal revokes future access; metadata-only audit of every shared operation                                                        |
| Cross-device conflict exploitation | multi-device, team          | Revision-gated writes; deterministic merge only for order-independent kinds; owner decides interactive conflicts; stale or divergent replicas stop syncing instead of overwriting        |
| Compromised executor node          | fleet                       | Executors hold no canonical data or credentials at rest; per-task scoped short-lived tokens; output re-validated at the owner-node boundary; token replay rejected after expiry          |
| Key loss and recovery abuse        | multi-device                | Recovery requires explicit owner-configured key escrow or verified re-pairing; no silent provider-side recovery path; recovery events are audited                                        |
| Metadata leakage                   | all                         | Relay and coordinator metadata minimized and bounded; audit events never contain query text, content, tokens, or private paths; traffic padding treated as an explicit per-mode decision |
| Deletion shortfall                 | managed, team               | Owner-initiated purge with export, verified purge evidence, bounded replica and backup retention windows published per mode                                                              |
| Silent corpus upload               | all                         | Default remains local-only; every mode requires explicit, revocable per-mode consent before any content leaves the owner boundary                                                        |

## What remains local-only

Raw source credentials, connector authorization state, consent records, audit logs, and the
canonical store's write authority remain local in every mode except where ADR 0003 explicitly
relocates one. The shared team brain is the only mode with a non-local canonical writer, and it is
restricted to workspace-scoped content whose members consented; personal brains in that mode remain
separate local stores.

## Unresolved risks

Unresolved until their implementation ADRs land: exact synchronization protocol and tombstone
retention; key-recovery user experience and its abuse trade-offs; residency guarantees achievable
per provider; coordinator transactional design and its audit schema; fleet attestation and
sandboxing strength; and all provider/build-buy selections. These gaps are acceptable while no
mode ships; they block implementation, not documentation.

## Review boundary

Changes to any boundary in this document or ADR 0003 require a new or amended ADR before
implementation. Security, privacy, operational, migration, and commercial review happens on those
ADRs, with GitHub issues tracking evidence; this document never mirrors milestone status.
