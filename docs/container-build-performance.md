# Container build performance

Native release builds, bounded cache reuse, and reproducible QEMU comparisons.

**Status:** Implementation; hosted performance and release verification pending.
**Issue:** [#2286](https://github.com/adea-ai/cortana/issues/2286)
**Baseline source:** `3164aaa421365ef3f76571c2ddb5e4225053ebde`

## Release behavior

The existing `v*` tag contract is unchanged. AMD64 uses `ubuntu-24.04` and ARM64
uses `ubuntu-24.04-arm`; neither release job installs QEMU. Each publishes an
immutable, untagged platform index with `provenance: mode=max` and `sbom: true`.
The existing provider conformance script runs against that exact digest on its
native architecture, including authentication, memory persistence through restart,
backup/verify, read-only execution, and the non-root UID 10001 check.

Only after **both** architecture jobs succeed does the publish job merge their
indexes. It checks the merged platform descriptors and linked attestations before
changing the version tag or `latest`, then fetches the final immutable index,
SLSA predicates and SPDX documents for both platforms. `release-image.json` is
written only after this verification. Its `image` and `digest` identify the
**multi-platform index**, not one architecture's manifest. No README or Compose
image default is replaced with an unbuilt digest; use this verified metadata when
updating deployment pins through the normal release process.

PRs and manual Container validation load local images and run the same runtime
checks without logging into GHCR, publishing, or exporting release caches. Local
Docker loads do not carry attestations; attestations are generated and verified
on the actual published release, not claimed from the local validation build.

The original ready-for-review-only PR trigger is retained. Draft PRs do not run
heavy validation. Its path filter covers Dockerfile/context inputs and the
runtime conformance fixture; test-only, desktop-only, release-tooling-only, and
`uv.lock` changes do not start a container build. Publication is not
automatically cancelled, and a separate publication concurrency group prevents
simultaneous alias updates. It does not
sort version numbers: do not launch older tags concurrently with newer releases
and assume `latest` will select the highest version.

## Selected optimizations and trade-offs

Native ARM64 removes emulation from Rust compilation and Python installation.
Two runners may consume more total runner-minutes even when elapsed time falls;
ARM64 queue availability must be measured. Release wall time includes the slower
native job, conformance, and the merge job, not the sum of build durations.

Both Bun and Node web-builder base images use `$BUILDPLATFORM` and their slim
variants. The web builder only needs Node, Bun, and the web workspace; this
avoids transferring the full Debian toolchain on every fresh runner. Their
static web output is target-independent; using the same host
platform for both avoids copying an incompatible Bun executable during QEMU
benchmarks. Version ARG/LABEL instructions follow package installation and
runtime assembly, so a version-only
change does not invalidate these heavy layers. The runtime command, ownership,
volumes, network exposure, dependencies and lockfiles are unchanged.

The Rust stage compiles a minimal `cargo-skeleton` in a dependency-only layer
before copying application sources. A source change can therefore reuse the
large dependency layer from the GHA cache and compile only the application
crate. The registry cache mount is architecture-specific and includes the Rust
1.88 toolchain boundary. It remains builder-local: the GHA backend does **not**
persist cache-mount contents, but the dependency layer itself is portable within
an architecture. Durable Cargo mount export, cargo-chef, and registry cache
policy changes are intentionally deferred until measurements justify their
storage and maintenance costs. Bun already has a lockfile-first frozen install
layer. Adding Bun/pip mounts without a persistence mechanism would not solve
ephemeral-runner reuse, so pip's no-cache behavior is retained rather than
claiming an unmeasured improvement.

## Cache policy and invalidation

The manual benchmark primes caches **only on the default branch** in warm mode.
Release tags and PRs read the two `container-native-v1-{amd64,arm64}` scopes and
never export. Benchmark scopes for `qemu` and `baseline` are separate; there are
four fixed scopes in total, not one per commit, tag or PR. No GHCR cache tags or
benchmark images are published. Build records and diagnostic artifacts expire
after seven days; digest handoff artifacts expire after one day. OCI archives are
runner-local and are not uploaded.

Fixed scopes bound key proliferation, not total bytes: intermediate layers still
consume the repository's configured Actions cache quota and are subject to
GitHub eviction. Inspect actual usage before and after priming, and remove stale
legacy `buildkit` caches only through an explicit maintenance operation. This
change does not delete unrelated caches or increase storage/billing limits.

| Change                              | Expected invalidation                                                       |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Version only                        | Final metadata; apt/pip and Cargo/web layers remain eligible                |
| Bun lockfile, root or web manifest  | Bun install and downstream web build                                        |
| Web source only                     | Web compilation, not frozen Bun installation                                |
| Rust/source tree or Cargo manifests | Final Cargo RUN; dependency layer changes only with manifests/toolchain     |
| Python source, pyproject or README  | Python installation and later runtime layers                                |
| Runtime base or apt instruction     | Runtime package installation and descendants                                |
| New tag                             | Read main's native caches; never depend on a previous tag's cache namespace |

## Reproducible measurement procedure

After the workflow is on main, use the same source commit and runner types for
all comparisons. Do not merge unrelated source changes between measurements.
Record resolved base-image digests and Buildx/BuildKit versions from build records;
a changed upstream base image is not an equivalent comparison.
The `baseline` strategy restores only the pre-change Dockerfile from the pinned
commit above; the application source remains the selected benchmark ref. This
isolates Dockerfile/execution changes instead of comparing different releases.

```sh
# No registry publication occurs in these workflows.
for strategy in baseline qemu native; do
  gh workflow run container-benchmark.yml --ref main -f strategy="$strategy" -f cache=cold
  # Run warm once to prime, then again AFTER that first run finishes to measure hits.
  gh workflow run container-benchmark.yml --ref main -f strategy="$strategy" -f cache=warm
done
# After all prime runs finish, repeat each warm invocation and save its run ID.
```

`cold` disables cache import/export and uses `no-cache: true` on a fresh hosted
runner. The first warm request can miss; do not label it a measured warm result
without checking the vertex cache-hit counts. Non-main benchmark runs cannot
prime release caches, so they are not a substitute for this main-branch drill.

Each run records action wall time, individual BuildKit vertices, stage work and
cache hits/misses, source SHA, run/attempt, requested cache mode, strategy and
Dockerfile variant. OCI size reports distinguish total archive bytes from unique
compressed image layer/config bytes per platform. Stage work overlaps and must
not be summed into wall time. Plain console progress and finite 90-minute release,
120-minute benchmark and 15-minute publication timeouts expose slow stages.

Save job timestamps with `gh api repos/adea-ai/cortana/actions/runs/RUN_ID/jobs`.
Record run creation-to-start delay separately from execution, and sum job execution
seconds for runner consumption. Benchmark OCI export does **not** measure GHCR
network push, manifest promotion or runtime conformance; use the real release
run for end-to-end wall time and cost. Save artifacts with the issue before their
seven-day expiry.

## Evidence and rollout gate

The issue reports historical releases of approximately 59 minutes (`0.56.18`)
and 65 minutes (`0.56.19`). Those observations are context, not controlled cold
and warm baselines, and do not establish the speedup of this implementation.

| Strategy                               | Cold wall / stage report | Warm wall / cache hits | Queue / runner consumption |
| -------------------------------------- | ------------------------ | ---------------------- | -------------------------- |
| Pre-change Dockerfile, one QEMU runner | Pending hosted run       | Pending hosted run     | Pending                    |
| Optimized Dockerfile, one QEMU runner  | Pending hosted run       | Pending hosted run     | Pending                    |
| Optimized Dockerfile, native runners   | Pending hosted run       | Pending hosted run     | Pending                    |

Before closing #2286: pass PR validation on both platforms, attach the controlled
cold/warm reports and measured improvement, verify runtime conformance and actual
SLSA/SPDX payloads on one real `v*` tag, and retain its immutable index digest and
release metadata. A successful unit test is not evidence of a faster hosted build.
Rollback is a reviewed revert of the workflow/Dockerfile changes; do not discard
attestations or runtime gates to make an unsuccessful release pass.

## References

- [Docker multi-platform builds](https://docs.docker.com/build/ci/github-actions/multi-platform/)
- [GHA cache scope/access rules](https://docs.docker.com/build/cache/backends/gha/)
- [Cache-mount persistence limitation](https://docs.docker.com/build/ci/github-actions/cache/)
- [Provenance inspection](https://docs.docker.com/build/metadata/attestations/slsa-provenance/)
- [SPDX inspection](https://docs.docker.com/build/metadata/attestations/sbom/)
