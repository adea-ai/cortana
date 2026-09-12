# ADR 0004: Device identity and key hierarchy

Status: proposed

## Context

ADR 0003 defines encrypted personal multi-device as a future mode whose relay stores only
ciphertext and whose trust rests on per-device keys provisioned per device, never copied. Before
synchronization can exist, the product needs a cryptographic device identity and key lifecycle that
already works in local-only mode with no account and no remote key service. Current storage keeps
provider and bearer credentials in owner-controlled env, keychain, and private files, and the only
cryptographic primitive in the dependency tree is SHA-2 hashing; nothing signs, agrees keys, or
seals.

## Decision

The contract `cortana.identity.device.v1` establishes an account root, device identities, a
versioned key hierarchy, and a lifecycle that supports enroll, list, rotate, revoke, wipe, and
recover, with the following fixed choices.

Identity and hierarchy. An account root is one freshly generated 256-bit root secret plus an
Ed25519 root signing keypair and an opaque account identifier. Every device enrolls with its own
freshly generated Ed25519 signing keypair for identity and trust decisions plus an X25519 agreement
keypair for future payload key agreement; device keys are never copied from another device or from
credential files. Purpose-specific leaf keys derive from the root secret through HKDF-SHA256 with
domain-separated, version-bound info strings (`kh1`), separating payload, metadata, and per-device
wrap purposes so no two purposes share a key. The root secret exists unsealed only in process
memory while deriving or re-wrapping.

At-rest sealing. All private key material seals with ChaCha20Poly1305 under a storage key derived
from the owner's 256-bit recovery key through HKDF-SHA256 with a per-registry random salt. The
recovery key is generated at initialization, shown to the owner exactly once, and never stored.
No account, remote key service, or default escrow exists: an owner who loses the recovery key and
every enrolled device loses sealed material permanently, and that trade-off is documented rather
than hidden. Optional owner-configured escrow is deferred to its own ADR. Provider, bearer, and
connector credentials stay in their existing storage and are never derived from, wrapped by, or
synchronized with identity keys.

Lifecycle and semantics. Enrollment is an explicit owner action that records a trust view — device
identifier, name, public key fingerprint, status, key version, creation, rotation, last-seen, and
revocation timestamps — while public views never contain secrets. Rotation replaces both device
keypairs, increments the key version, and retires the old public keys into bounded history.
Revocation ends future access: a revoked device's key version stops advancing, so it cannot unwrap
any post-revocation purpose key; data already delivered remains on that device until its owner
wipes it locally, which is recorded as explicit historical-access semantics rather than a remote
kill claim. Wipe destroys the device's sealed private material and retires its public keys.
Recovery re-seals the registry under a new recovery key without touching device or purpose keys.
Root rotation advances a root generation counter bound into the hierarchy's derivation info,
generates a new root secret and root keypair, and active devices derive fresh purpose keys from the
new root; revoked and wiped devices never receive new material. Every mutating operation writes a
metadata-only audit event through the existing audit boundary.

Transport boundary. The model's observable property is that a relay or transport observer sees
ciphertext, key versions, and routing metadata only; purpose keys and root secrets never transit a
network in this contract. Whether the future synchronization protocol in #2087 can preserve that
property is decided there; this ADR fixes only that the identity layer will not be the weak link.

Migration and review. The registry records `contract_version` and `key_hierarchy_version`.
Changing cryptographic choices means a new hierarchy version, fresh keys, and explicit re-wrapping
or re-enrollment — never reinterpreting existing key bytes under a new meaning. Before any
synchronized mode activates, the choices in this ADR receive independent security review, and that
review gates activation rather than the merge of this document.

## Consequences

- Local-only users gain a dormant, opt-in identity command group with no account, no network, and
  no changed default behavior; owners who never run it keep exactly today's product.
- Pure-Rust dependencies arrive in the binary — Ed25519, X25519, ChaCha20Poly1305, HKDF, and
  secure randomness — with the usual binary-size and audit cost but no new runtime services.
- Owners hold exactly one recovery secret whose loss is unrecoverable by design; support and
  documentation must make that visible at generation time.
- Revoked devices keep already-delivered data, so the sync protocol inherits an explicit obligation
  to bound what is delivered, not a promise of retroactive erasure.
- Synchronization work now has concrete key semantics to consume and an audit trail to extend.
