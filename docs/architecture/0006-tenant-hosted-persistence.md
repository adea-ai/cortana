# ADR 0006: Tenant-aware hosted persistence and service boundaries

Status: proposed

## Context

ADR 0003 defines the managed personal cloud as a hosted single-node Cortana per owner: the
canonical writer is the hosted node, data and deletion authority remain the owner's, and isolation
is enforced at the deployment boundary rather than by shared-table tenancy. Issue #2088 requires
that boundary to become concrete: hosted services, persistence selection, tenant lifecycle,
migration rules, and the guarantee that nothing reads local SQLite or local credentials
implicitly, while Local-first standalone operation remains a full product.

## Decision

Service decomposition. The managed mode decomposes into a **control plane** and per-tenant
**data planes**. The control plane owns tenant identity, placement, lifecycle state, quotas,
residency, and purge evidence — metadata only, never canonical content. Each tenant data plane is
one dedicated Cortana store (today SQLite; the store contract of ADR 0001 is the provider-neutral
seam) plus its service processes, running under a per-tenant system identity. Retrieval,
connectors, memory, vectors, backups, and audit remain responsibilities of the tenant data plane
exactly as in Self-hosted; the control plane never brokers content. This keeps the single-writer
rule everywhere and makes "tenant isolation" a deployment fact — separate stores, separate
credentials, separate volumes — instead of a query-time filter that one bug can bypass.

Persistence selection. Technologies are chosen behind the existing store contract with
postgres-class engines as the first candidate swap for a tenant data plane. The swap is evaluated
against measured benefit (ADR 0002's rule) and must preserve: single-writer per tenant, verified
backups, revision and audit integrity, ACL semantics, and the public MCP/HTTP/ContextBundle
contracts. Until such a swap ships with evidence, SQLite per tenant is the supported persistence.

Tenancy lifecycle. The control plane records tenants as `provisioning → active ⇄ suspended →
purging → purged`, with purge evidence retained after data destruction. Provisioning creates a
dedicated store path, per-tenant credentials namespace, and quota/retention/residency records;
suspension makes the data plane unopenable through the control plane while preserving bytes for
reinstatement; purging is two-phase — a recorded purge intent followed by a separate confirmed
destruction that requires the tenant identifier as the confirmation and leaves only a purge
receipt (digest, timestamp, witness identity). Every transition is audited metadata-only. Data
planes open for service only through the control plane while `active`; suspended or unknown
tenants cannot be opened by operators or services, and no code path falls back to a local user
store or local credentials.

Source-of-truth modes. `local` (today), `cloud` (managed data plane is canonical), and `hybrid`
(local canonical for chosen scopes, cloud mirror for others) are declared per tenant at
provisioning and versioned with the migration tooling. Transitions run through the existing
verified export/import and backup paths — never raw database copying across trust boundaries —
and are reversible to the previous mode with a verified restore. Deletion guarantees follow the
reliability contracts: purge removes data-plane bytes and leaves the receipt; synced copies die
at tombstones with ADR 0003's historical-access semantics.

Migrations. Schema and persistence migrations are online where the store supports them and
explicitly maintenance-gated otherwise; each migration is observable (start/finish audit events
with counts), reversible where promised in its contract, and tested against a provisioned tenant
fixture before fleet rollout. Migration state lives in the migrated store, not the control plane.

## Consequences

- The hosted build starts with a control plane and lifecycle that are real, testable, and small —
  no Postgres dependency, no shared-tenancy risk — while the persistence swap remains a measured,
  contract-preserving follow-up.
- Tenant isolation is provable from deployment facts (separate stores, credentials, volumes) plus
  the open-guard, which is a much smaller adversarial surface than row-level filtering.
- The control plane becomes the one place tenant metadata exists; it must therefore never hold
  content or credentials, or it would become the highest-value target — enforced by the same
  metadata-only rules as audit.
- Local standalone operation is untouched: it neither appears in the registry nor depends on it.
- Purge evidence retained forever means a small, permanent metadata residue of tenant existence
  after deletion; that trade-off is deliberate and disclosed here.
