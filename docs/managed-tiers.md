# Managed tiers and migration contracts

The product and technical definition for future managed Cortana tiers and the explicit migrations
into them, per ADRs 0003 and 0006. Local single-device and user-controlled Self-hosted/VPS remain
independently installable full products; nothing here moves ordinary self-hosting into the managed
roadmap, and Agent HQ subscriptions, billing, and first-party commercial packaging stay outside
this repository — cross-product packaging consumes public release artifacts and contracts only.

## Tier envelopes

Envelope numbers are initial values derived from measured baselines — the self-hosted reference
(2 CPUs, 2 GiB RAM, 20 GiB plus three times the canonical database), the deterministic eval
ceilings (60 CPU s, 2 GiB peak RSS, 5 s p95 latency, 16 provider requests, $1 estimated cost per
evidence run), the live-index bounds (100 cases, 1 GiB, 30 s request / 300 s total), and the
tenant quota machinery (`max_documents`, `storage_quota_bytes`, `retention_days`). Every number is
adjustable only through measured evidence per the reliability contracts' error-budget rule; the
pricing and support-relationship layer is an owner commercial decision and is deliberately absent.

| Boundary                | Personal                        | Personal Plus                   | Shared (per workspace)          |
| ----------------------- | ------------------------------- | ------------------------------- | ------------------------------- |
| Mode (ADR 0003)         | managed personal cloud          | managed personal cloud          | team brain workspaces           |
| Canonical writer        | hosted node per owner           | hosted node per owner           | workspace coordinator           |
| Documents               | 100,000                         | 500,000                         | 250,000 per workspace           |
| Storage                 | 10 GiB                          | 50 GiB                          | 25 GiB per workspace            |
| Query latency objective | reliability contract SLOs       | reliability contract SLOs       | reliability contract SLOs       |
| Sync bundle exchange    | included                        | included                        | included                        |
| Fleet connector jobs    | not included                    | bounded by grant budgets        | bounded by grant budgets        |
| Backup cadence          | daily, 7 retained               | daily, 14 retained              | daily, 14 retained              |
| Retained history        | 90 days deletion grace          | 180 days deletion grace         | 180 days deletion grace         |
| Residency               | pinned at provision             | pinned at provision             | pinned at workspace creation    |
| Support expectation     | community + documented runbooks | community + documented runbooks | community + documented runbooks |

Quotas are enforced by the data plane itself (transactional document and byte accounting); the
control plane records them. Tier changes are quota-record changes that take effect on the next
write and never delete data retroactively — a downgrade that shrinks an envelope makes the tenant
read-only for new growth until usage fits, with the overage reportable, because deletion without
an owner purge receipt is not a thing this product does.

## Migration contracts

Migrations into managed mode are **opt-in, encrypted, dry-run capable, reversible within
documented constraints, and covered by export/deletion proof**.

- **Local → managed (Personal/Personal Plus).** The owner runs a migration job against their
  local store: it exports canonical documents, memories with full lifecycle fields, ACL labels,
  provenance, revisions, and workspace mappings into encrypted sync-bundle-format payloads
  (ADR 0004 identity keys, ADR 0003 envelope rules) addressed to the provisioned data plane.
  Migration is a restore of that export onto the tenant — the same verified import path as
  backup restore, never raw database copying.
- **Self-hosted → managed.** Identical contract with the VPS operator exporting from the
  documented backup/verify/restore tooling. Single-node Self-hosted (#2196) is not redefined or
  blocked; the modes coexist.
- **Dry run.** Every migration first produces a manifest: counts per object class, total bytes,
  destination residency, the exclusion list applied, and the identities of every source included.
  The manifest is the consent artifact — the owner approves that exact manifest.
- **Exclusions are structural.** Credentials, connector authorization state, consent records,
  audit logs, private paths, and any source excluded by the owner's rollout/ACL configuration are
  never uploaded; the manifest proves their absence, and excluded data classes are enumerated
  from the local-only boundary rather than inferred at run time.
- **Reversibility.** A migration window (matching the retention grace) keeps the source store
  authoritative and untouched; the owner can verify the managed copy via the dry-run manifest
  comparison and revert by continuing local operation — the managed copy is then purged through
  the normal two-phase purge with receipt. After the window, reversal is a managed→local export
  with the same proof obligations.
- **Proof.** Completion emits the migration manifest, the encrypted-payload digests, the data
  plane's applied-revision evidence, and the deletion/reversibility receipt ids. Export and
  deletion proof together satisfy the issue's "complete export/deletion proof" requirement.

## Policies

- **Compatibility and upgrades**: tenant data planes upgrade on the same versioned migration
  ledger and maintenance gate as every store; hosted upgrades are maintenance-gated by default.
- **Residency**: pinned at provision/workspace creation (ADR 0006/0007); regional movement is
  export/import into a new tenant or workspace, audited and consent-gated, never in-place.
- **Retention and deletion**: per-tier grace above; deletion always flows through the two-phase
  purge with retained receipts; synced copies terminate at tombstones with historical-access
  semantics (ADR 0003).
- **Recovery and rollback**: the reliability contracts' RPO/RTO and restore-drill rules apply to
  every tier; recovery is from verified backups, owner-restorable.
- **Key/identity integration**: every tier inherits ADR 0004 identity, ADR 0005 fleet grants, and
  ADR 0007 membership — recovery remains an owner procedure by design (no-escrow default).
- **Independence**: Local and Self-hosted profiles neither require nor degrade into managed
  clients; the managed mode is additive, and its envelopes, quotas, and support expectations have
  no effect on un-managed installations.
