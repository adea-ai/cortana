# ADR 0005: Connector fleet task tokens and result envelopes

Status: proposed

## Context

ADR 0003 defines the remote connector fleet as stateless executor nodes that hold no canonical
data or credentials at rest and stream observations back through the existing bounded connector
boundary; the owner node stays the only canonical writer and the only issuer of per-task,
short-lived credentials. Issue #2090 requires that a compromised worker cannot read unrelated
tenants, sources, or secrets, that no incomplete or expired job can authorize deletion, and that
duplicate execution is idempotent. The device identity and key hierarchy of ADR 0004 now exist.

## Decision

The contract `cortana.fleet.v1` adds two signed objects, both derived from the existing device
identity layer with no new cryptography.

Task grants. The owner node issues a task grant as a JSON envelope: claims plus issuer device id
plus an Ed25519 signature over the claim bytes. Claims carry a unique token id, job id, capability,
workspace and source scope, a credential reference (a name resolved owner-side only, never a
secret), document/byte budgets, a cursor checkpoint, issued/ expiry timestamps, and the audience
worker device id. An executor verifies the signature against its local trust view, requires the
issuer device to be Active in that view, requires itself as audience, and enforces expiry at
verification time. A grant therefore confers exactly one bounded job on exactly one worker until
expiry; a compromised worker can read nothing outside its grant, and revoking the worker in the
registry stops future verification without touching canonical state.

Result envelopes. Executors return observations sealed to the issuing owner device with the same
pattern as sync bundles: static-static X25519 agreement between the executor and owner device
keys, ChaCha20Poly1305 with the envelope header as associated data, and an Ed25519 signature over
header and ciphertext. The header repeats the token id so the owner node can enforce idempotent
delivery by token id: duplicate executions surface as duplicates, never as double-applied state.
Envelopes carry observations only — candidate documents and progress. Deletion and reconciliation
authority never leaves the owner node: fleet state cannot authorize deletion, so incomplete,
expired, failed, or reassigned jobs structurally cannot delete anything. Owner-side application
re-enters through the existing connector spool validation with validation-before-sync and
non-reconcile semantics unchanged.

Operational contracts defined at the boundary now, implemented with the runtime they belong to:
leases and heartbeats are owner-side bookkeeping that gate token issuance and renewal; capability
and sandboxing profiles constrain what a worker process may touch; egress policy and resource
quotas are deployment properties of the worker host; dead-letter, retry/backoff, and regional
placement are queue-service concerns. None of them can widen the trust boundary fixed above: a
token is the only capability a worker ever holds, and it expires.

## Consequences

- The fleet can be built and tested entirely from the device identity registry — pairing a worker
  is `identity export`/`adopt`, issuing work is one signed grant, and no queue service is required
  to prove the security properties.
- Workers keep only a bounded, non-canonical record of seen token ids for replay rejection; losing
  it risks re-delivery, which owner-side idempotency absorbs.
- Clock correctness matters on executors: expiry is enforced against the worker's clock, so fleet
  hosts need sane time synchronization, recorded in the threat model as an operational assumption.
- Sandboxing, egress policy, and the queue service remain deferred with their own review gates;
  this ADR fixes only what the worker is cryptographically allowed to know and return.
