# ADR 0007: Team brain workspaces, membership, and access boundaries

Status: proposed

## Context

ADR 0003 defines the shared team brain as hosted workspaces with a server-side write coordinator,
per-workspace residency, member consent, and strict personal-brain separation, with cross-workspace
leakage ranked as the highest threat. Issue #2089 requires membership, roles, invitations,
offboarding, export, deletion, and access explanations without weakening personal isolation. The
tenant control plane of ADR 0006 provides the lifecycle pattern; the device identity registry
provides opaque member identities (account ids), which are all the control plane ever sees.

## Decision

The contract `cortana.team.v1` adds a membership control plane whose isolation unit is the
workspace: one dedicated store per workspace, marker-stamped and openable only through the
control plane — the same deployment-boundary model as tenants, because one-bug-bypassable
row-level filtering is exactly what ADR 0003 rejected.

Membership and roles. Members are opaque account identities. Roles are `owner`, `admin`,
`contributor`, `reader`. Access is computed at operation time from the registry and grants no
durable capability: `read` for readers and above, `write` for contributors and above, `invite`
and member removal for admins and above, role management and workspace deletion for owners only.
Authorization denials are stable and do not reveal whether a workspace or member exists.
Invitations are explicit objects — invited by an admin, addressed to one member id, single-role,
expiring, accepted only by the invitee, idempotently rejected when duplicated. Removal
(owner/admin) and voluntary leave take effect immediately at the next authorization check because
no cached grant exists; prior-local copies remain under ADR 0003's historical-access semantics.

Personal separation. Workspaces never reference a member's personal store; membership records
carry account ids only, and the control plane has no API that names personal paths. Sharing is
therefore never triggered by workspace selection or identity coincidence: content enters a
workspace through an explicit write by a contributor or above, with the member identity recorded
as attribution.

Residency, export, and deletion. Residency is pinned at workspace creation and immutable; a
workspace that must move regions migrates through export/import into a new workspace, which is
auditable and consent-gated, never an in-place relocation. Every member has an access
explanation — the effective role and allowed operations, available on demand — and an export
manifest of their accessible workspace state through the existing verified export paths. Deletion
is two-phase like tenants: recorded intent, then confirmed destruction repeating the workspace
id, retaining a purge receipt. Owner-only, and it never touches member personal stores.
Organization closure is the composition of per-workspace purges plus member notifications, and is
a runtime concern built on these primitives.

Attribution and shared memory. Shared records carry the contributing member id, workspace scope,
and provenance from the canonical contract; contradiction, redaction, and derived-representation
semantics remain the memory contract's, unchanged by sharing. The control plane stores none of it.

## Consequences

- The membership core is testable without a hosted deployment: two control-plane participants are
  stores with adopted identities, exactly as in the fleet and sync increments.
- Access is registry-computed per operation, so revocation is immediate and cache-free by design;
  agents and devices hold no shareable capability beyond their own identity.
- The write coordinator, invitation delivery, and organization-level operations remain runtime
  concerns; this ADR fixes only what membership cryptographically and structurally means.
- Cross-workspace leakage reduces to marker verification plus registry scoping — the same small
  adversarial surface as tenants, which is where the release-blocking leak tests concentrate.
