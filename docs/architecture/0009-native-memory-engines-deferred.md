# ADR 0009: Native Memory Engine; External Memory Engines Deferred

- Status: Accepted (decision recorded from issue #141, 2026-08-24)
- Deciders: Cortana owner
- Related: [ADR 0003](0003-multi-device-and-managed-modes.md),
  [ADR 0008](0008-local-relay.md), [memory contract](../contracts/memory.md),
  [memory documentation](../memory.md)

## Context

Cortana needs durable, ACL-scoped, citation-aware memory for its answer and
context surfaces. The ecosystem offers several hosted or framework-level
memory engines that promise off-the-shelf storage, consolidation, and recall.
Adopting one would couple Cortana's memory semantics, provenance model, and
ACL enforcement to an external service's data model and release cadence.

The native-memory lifecycle (explicit remember/recall/forget with retention
tiers and scopes) shipped with the M1 verified core baseline. Automatic
observation, candidate classification, consolidation, reflection, and review
UX were later delivered under M6 (issues #2061–#2068) with quality and safety
gates (#2068).

## Decision

Cortana keeps memory **native**. Memory records, their content types,
retention tiers, scopes, and lifecycle are owned by the Cortana store and
governed by the versioned memory contract (`docs/contracts/memory.md`).
External memory engines are **deferred**: Cortana neither depends on them nor
integrates them for its operational memory path.

Requirements that would ever revisit this decision:

1. An external engine must enforce Cortana's ACL and scope model without
   proxies that weaken the fail-closed authorization boundary.
2. It must preserve provenance separation: memory is never citation evidence,
   and citations never originate from memory content.
3. It must support the versioned contract envelope so consumers can validate
   what they receive (see the provider conformance fixture).
4. Migration must remain bounded, reviewed, and reversible like every other
   store migration.

Until those hold, memory intelligence work continues natively under the
contracts and gates referenced above.

## Consequences

- Memory semantics evolve only through the versioned contract, keeping
  provider and agent integrations stable (M8 conformance surfaces).
- No external dependency, data residency, or availability coupling for the
  memory path in the local-only product shaped by ADR 0008.
- Teams evaluating third-party memory products must treat them as out of
  scope until the revisit requirements above are met and this ADR is
  superseded.
