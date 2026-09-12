# ADR 0003: Future multi-device and managed-hosted modes

Status: accepted (2026-09-12)

## Context

The supported profiles remain the local single-device Desktop/agent installation and the
user-controlled single-node Self-hosted/VPS deployment. Both run one canonical SQLite store under
the single-writer rule, hold credentials in owner-controlled storage, verify backups before trust,
and operate inside the `cortana.security.v1` trust model. Demand exists for synchronized
multi-device use, a managed personal cloud, shared team brains, and remote connector execution.
Each of these moves state, keys, or trust off the owner's machine and would weaken the current
model if added casually.

Carried-forward constraints: consent stays local-first, explicit, and revocable; Cortana remains
an independently usable AGPL product whose managed options never become a requirement; managed
infrastructure must not absorb Agent HQ or Control Plane responsibilities; a shared-filesystem or
multi-writer SQLite deployment is not a distributed database; and the public MCP/HTTP,
ContextBundle, and memory contracts keep their semantics wherever an equivalent exists.

## Decision

Four future modes are defined at the boundary level now. None is implemented by this decision, and
each requires its own implementation ADRs with measured evaluation before code lands.

### Encrypted personal multi-device

One owner-designated primary node stays the canonical writer and source of truth; secondary devices
synchronize by exchanging revisioned, end-to-end-encrypted change sets through a relay that stores
only ciphertext and routing metadata. The credential owner is the local owner on each device;
device identities and keys are provisioned per device and never copied from existing credential
files. The key boundary is the owner's devices: the relay and any provider cannot decrypt payloads.
Conflicts resolve per record from explicit revisions; deterministic merges are limited to
idempotent, order-independent kinds, and interactive conflicts surface to the owner instead of
auto-merging content. Deletion propagates as tombstones with bounded relay retention, and the
deletion contract remains the owner's local forget action. Backups stay owner-made and owner-held
from a designated node. The failure mode is split-brain stalling synchronization, never silent data
replacement; a device that cannot verify the relay's consistency stops syncing and reports.

### Managed personal cloud

The operator runs a hosted single-node Cortana per owner on infrastructure the operator controls,
using the same store and API contracts as Self-hosted. The canonical writer is that hosted node;
the data authority and deletion authority remain the owner. Credentials split by class: provider
keys stay owner-supplied where semantics allow, and operator-held infrastructure credentials are
scoped, rotated, and never shared across owners. The key boundary is per-tenant: each owner's
store, volume, and backups are isolated at the deployment boundary, not by shared-table tenancy.
The conflict model is none: one node per owner keeps the single-writer rule. Deletion follows a
documented purge contract with owner-initiated export, verified purge, and purge evidence. Backups
are operator-managed but owner-restorable through the existing verified-backup contract. The
failure mode is operator compromise or loss of the hosted node; recovery is re-provision from
owner-held backups, and the threat model treats the operator as a distinct principal, not a trusted
administrator of content.

### Shared team brain

A hosted, multi-tenant service hosts one canonical store per workspace. The server-side write
coordinator is the canonical writer for shared workspaces, and this is an explicit, documented
departure from local-first writing: members consent per workspace, and personal local brains stay
separate stores that are never merged silently. Credentials belong to each member; the key boundary
is per-workspace ACL scope enforced at the coordinator before serialization, with residency pinned
per workspace at provisioning. Conflicts serialize through the coordinator's transactional writes;
offline member edits reconcile through revisioned submission with the same explicit-conflict rule
as multi-device. Deletion supports both member-level and workspace-level purge with export, and
membership removal revokes future access without rewriting history that remained lawful while the
member held access. Backups are operator-managed per workspace with owner-administrator restorability.
The failure mode is membership or ACL error, so every shared read and write is audited with
metadata-only events, and cross-workspace leakage is the model's highest-ranked threat.

### Remote connector fleet

Connector execution moves to remote, least-privilege executor nodes, but the canonical store stays
where it is today: on the owner's local or Self-hosted node, which remains the only writer.
Fleet nodes are stateless executors that receive bounded task payloads and stream observations back
as versioned JSON Lines through the existing connector boundary. The credential owner is the owner
node, which issues per-task, scoped, short-lived credentials; fleet nodes never hold source
credentials, canonical data, or keys at rest. The key boundary is the owner node's validator: fleet
output re-enters through the same bounded spool and validation path as local connectors. The
conflict model is none — executors produce observations, not writes. Deletion of a fleet node is
revocation of its registration and in-flight tokens; no purge of canonical state is required
because none exists there. Backups cover registrations and tokens only. The failure mode is a
compromised executor: blast radius is the revoked task scope, and the model requires that a fleet
node cannot read beyond its assigned task or replay stale results past token expiry.

### Boundaries that do not change

Raw source credentials, connector authorization state, audit logs, and the owner's consent record
remain local-only in every mode unless a mode's implementation ADR explicitly moves one with its
own key boundary and consent flow. Any cloud participation in any mode requires explicit,
revocable, per-mode consent; absence of consent is the default and the default product remains
local-only. Rejected explicitly: shared-filesystem and multi-writer SQLite across nodes or
containers; copying credential files between devices; treating hosted Postgres as automatic
multi-writer safety; silent corpus upload; and relabeling single-node Self-hosted as a managed
feature. Self-hosted single-node remains independently supported and certified on its own.

### Migrations and providers

Migration into each mode runs through documented export/import and verified-backup paths, never
raw database copying between trust boundaries. Local gains multi-device by pairing a second device
against a verified backup seed. Local and Self-hosted reach the managed cloud by restoring an
owner export onto a provisioned tenant. Provider and build/buy choices — self-operated relay,
managed Postgres, hosted tenancy platform, sync-engine vendor — are evaluated per mode against
ciphertext-only storage, residency control, AGPL compatibility, exit portability, measured cost,
and deletion evidence; no provider selection is made by this ADR.

### Contract preservation

Public MCP/HTTP, ContextBundle, and memory contracts keep their local semantics unchanged.
Mode-specific additions are additive and versioned: `cortana.security.v1` gains per-mode annexes
for identity, key, tenancy, and deletion boundaries, and ContextBundle gains sync-provenance
fields only where they do not alter existing pinning and inclusion semantics. A mode that cannot
preserve a contract's semantics versions a new contract explicitly instead of overloading the
existing one.

## Consequences

- Future work has a reviewable boundary document, and implementation issues are gated on mode-level
  and then feature-level ADRs rather than ad hoc design.
- The single-writer rule survives everywhere except the shared team brain coordinator, where it is
  replaced by an explicit transactional writer and audited as a model change.
- Key management, revisioned synchronization, tenancy, and fleet execution each become sized,
  separately reviewable efforts; none can land implicitly.
- The cost of this decision is ceremony: modes cannot ship as config flags on the current binary.
- Deferred decisions — provider selection, exact sync protocol, key-recovery UX — remain open and
  are recorded in the managed threat model as unresolved risks until their ADRs land.
