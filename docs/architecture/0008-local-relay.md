# ADR 0008: Local-only self-operated sync relay

Status: accepted (2026-09-15, owner decision)

## Context

ADR 0003 gated relay transport on a provider/build-buy selection, and the managed personal cloud
remained a documented-but-unlaunched mode. The owner has now decided the product direction:
**Cortana is a local-only service.** The managed personal cloud will not be operated, and the
fleet runtime has no deployment target. What remains valuable and buildable is the relay as a
**self-hosted component of the existing product**: an owner who runs Self-hosted Cortana on a VPS
or home server can run the relay on the same node so their own devices synchronize across
networks, with the owner as the only operator and the only party who could ever hold a key.

## Decision

The relay ships as `cortana relay serve` inside this repository: a stateless, loopback-by-default
HTTP service with dedicated per-deployment storage holding exclusively opaque ciphertext bundles
and minimal routing metadata (recipient id, size, arrival time). It reuses the M11 bundle
crypto unchanged — the relay cannot read, decrypt, or verify anything it carries, by design.

Boundaries, fixed:

- **Local-only operation.** The relay binds to loopback unless the operator explicitly configures
  a remote bind, and a remote bind requires a bearer token on every request (the security model's
  unsafe-remote-exposure rule). There is no hosted deployment: nobody operates a relay for anyone
  else, so the managed personal cloud (ADR 0003 mode 2), the fleet worker runtime (ADR 0005
  runtime concerns), and their production reliability evidence are out of scope and will not be
  built.
- **Bounded, owner-owned retention.** Per-recipient mailboxes cap bundle count and bundle size,
  and every bundle expires (default 14 days). Expired and over-quota bundles are swept server-side;
  clients acknowledge fetched bundles by deletion. The operator owns the disk, so deletion
  evidence is direct.
- **Client-side everything else.** Encryption, trust, conflict resolution, and application remain
  exactly the M11 sync engine; the relay adds transport and nothing else. The sync bundle remains
  the resumable unit (a relay mailbox holds a bounded queue of bundles).
- **Deferred explicitly.** The Apple Developer signing/notarization lane closes with this decision:
  a local-only product distributes through source builds and GitHub releases to its own operator,
  for which the documented ad-hoc packaging path is the intended state. The approved-corpus lane
  remains waived under the M10 precedent. Push notifications, traffic padding, and multi-tenant
  relay federation are rejected for this scope.

## Consequences

- Self-hosted owners gain real cross-network device synchronization with zero new accounts,
  vendors, or operating obligations; Local-only single-device users are untouched (the relay is
  opt-in and off by default).
- The earlier managed/fleet documentation (ADRs 0003/0005/0006 modes 2–4) remains as accepted
  architecture for a future that is not scheduled; nothing in the product requires it, and this
  decision records that it will not be built without a new owner decision.
- The relay's only trust obligation is uptime for its own owner; there is no service liability,
  no tenant data, and no abuse surface beyond resource limits that the server enforces locally.
