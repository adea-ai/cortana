//! Tenant control plane (`cortana.tenant.v1`).
//!
//! Metadata-only registry for the managed mode of ADR 0006: tenant lifecycle
//! (provision → active ⇄ suspended → purging → purged with retained purge
//! evidence), placement, quotas, and residency. The control plane never holds
//! canonical content or credentials, and data planes open only through it
//! while `active` — suspended or unknown tenants cannot be opened, and no
//! path falls back to a local user store.

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};

use crate::store::Store;

pub const TENANT_CONTRACT: &str = "cortana.tenant.v1";
const REGISTRY_META_KEY: &str = "tenants.registry";
const REGISTRY_TENANT_LIMIT: usize = 1000;
const DATA_PLANE_MARKER: &str = "tenant.tenant_id";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TenantStatus {
    Provisioning,
    Active,
    Suspended,
    Purging,
    Purged,
}

/// Control-plane record for one tenant data plane; content never appears here.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantRecord {
    pub tenant_id: String,
    pub name: String,
    pub residency: String,
    pub source_of_truth: String,
    pub status: TenantStatus,
    pub store_path: String,
    pub max_documents: u64,
    pub storage_quota_bytes: u64,
    pub retention_days: u32,
    pub created_at: String,
    pub suspended_at: Option<String>,
    pub purge_requested_at: Option<String>,
    pub purged_at: Option<String>,
    pub purge_receipt_digest: Option<String>,
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn load_registry(store: &Store) -> Result<Vec<TenantRecord>> {
    match store.meta_get(REGISTRY_META_KEY)? {
        Some(raw) => serde_json::from_str(&raw).context("tenant registry is not valid JSON"),
        None => Ok(Vec::new()),
    }
}

fn save_registry(store: &Store, registry: &[TenantRecord]) -> Result<()> {
    store.meta_set(REGISTRY_META_KEY, &serde_json::to_string(registry)?)
}

fn record_mut<'a>(
    registry: &'a mut [TenantRecord],
    tenant_id: &str,
) -> Result<&'a mut TenantRecord> {
    registry
        .iter_mut()
        .find(|record| record.tenant_id == tenant_id)
        .ok_or_else(|| anyhow::anyhow!("unknown tenant {tenant_id}"))
}

/// Metadata-only control-plane registry; one per managed deployment.
pub struct TenantControlPlane {
    store: Store,
    registry_file: std::path::PathBuf,
}

pub struct ProvisionRequest {
    pub name: String,
    pub residency: String,
    pub source_of_truth: String,
    /// Dedicated data-plane directory, created by provisioning.
    pub store_path: std::path::PathBuf,
    pub max_documents: u64,
    pub storage_quota_bytes: u64,
    pub retention_days: u32,
}

impl TenantControlPlane {
    /// Open (creating if needed) the registry at a dedicated path.
    pub fn open(path: &std::path::Path) -> Result<Self> {
        Ok(Self {
            store: Store::open(path)?,
            registry_file: path.to_path_buf(),
        })
    }

    /// Provision a tenant: registry record plus a dedicated data-plane store
    /// stamped with the tenant marker. The registry path itself is refused as
    /// a data-plane location so the control plane can never be a tenant.
    pub fn provision(&self, request: &ProvisionRequest) -> Result<TenantRecord> {
        if request.name.trim().is_empty() {
            bail!("tenant name cannot be empty");
        }
        if !matches!(
            request.source_of_truth.as_str(),
            "local" | "cloud" | "hybrid"
        ) {
            bail!("source of truth must be local, cloud, or hybrid");
        }
        // A purge destroys the data-plane directory recursively; refuse any
        // placement that would contain the control-plane registry itself.
        if self.registry_file.starts_with(&request.store_path) {
            bail!("tenant data plane cannot contain the control-plane registry");
        }
        let mut registry = load_registry(&self.store)?;
        if registry.len() >= REGISTRY_TENANT_LIMIT {
            bail!("tenant limit of {REGISTRY_TENANT_LIMIT} reached");
        }
        if registry
            .iter()
            .any(|record| record.store_path == request.store_path.to_string_lossy())
        {
            bail!("store path is already registered to a tenant");
        }
        std::fs::create_dir_all(&request.store_path).with_context(|| {
            format!(
                "failed to create data plane at {}",
                request.store_path.display()
            )
        })?;
        let store = Store::open(&request.store_path.join("store.sqlite3"))?;
        let tenant_id = uuid::Uuid::new_v4().to_string();
        store.meta_set(DATA_PLANE_MARKER, &tenant_id)?;
        // The data plane is created and stamped above, so provisioning
        // completes within this call.
        let record = TenantRecord {
            tenant_id,
            name: request.name.trim().to_string(),
            residency: request.residency.trim().to_string(),
            source_of_truth: request.source_of_truth.clone(),
            status: TenantStatus::Active,
            store_path: request.store_path.to_string_lossy().to_string(),
            max_documents: request.max_documents,
            storage_quota_bytes: request.storage_quota_bytes,
            retention_days: request.retention_days,
            created_at: now_rfc3339(),
            suspended_at: None,
            purge_requested_at: None,
            purged_at: None,
            purge_receipt_digest: None,
        };
        registry.push(record.clone());
        save_registry(&self.store, &registry)?;
        Ok(record)
    }

    /// All tenant records, including purge receipts.
    pub fn list(&self) -> Result<Vec<TenantRecord>> {
        load_registry(&self.store)
    }

    /// Open a tenant data plane; only `active` tenants open, and the data
    /// plane's own marker must match the registry to catch path swaps.
    pub fn open_data_plane(&self, tenant_id: &str) -> Result<Store> {
        let registry = load_registry(&self.store)?;
        let record = registry
            .iter()
            .find(|record| record.tenant_id == tenant_id)
            .ok_or_else(|| anyhow::anyhow!("unknown tenant {tenant_id}"))?;
        if record.status != TenantStatus::Active {
            bail!(
                "tenant {tenant_id} is {} and cannot open",
                serde_json::to_value(record.status)?
            );
        }
        let store = Store::open(&std::path::Path::new(&record.store_path).join("store.sqlite3"))?;
        let marker = store.meta_get(DATA_PLANE_MARKER)?;
        if marker.as_deref() != Some(tenant_id) {
            bail!("data plane identity marker does not match the registry");
        }
        Ok(store)
    }

    /// Suspend an active tenant: bytes are preserved; the data plane will not
    /// open until reinstatement.
    pub fn suspend(&self, tenant_id: &str) -> Result<TenantRecord> {
        let mut registry = load_registry(&self.store)?;
        let record = record_mut(&mut registry, tenant_id)?;
        if record.status != TenantStatus::Active {
            bail!("only active tenants can be suspended");
        }
        record.status = TenantStatus::Suspended;
        record.suspended_at = Some(now_rfc3339());
        let record = record.clone();
        save_registry(&self.store, &registry)?;
        Ok(record)
    }

    /// Reinstate a suspended tenant.
    pub fn activate(&self, tenant_id: &str) -> Result<TenantRecord> {
        let mut registry = load_registry(&self.store)?;
        let record = record_mut(&mut registry, tenant_id)?;
        if record.status != TenantStatus::Suspended {
            bail!("only suspended tenants can be reactivated");
        }
        record.status = TenantStatus::Active;
        record.suspended_at = None;
        let record = record.clone();
        save_registry(&self.store, &registry)?;
        Ok(record)
    }

    /// Record purge intent; destruction requires the separate confirmed call.
    pub fn request_purge(&self, tenant_id: &str) -> Result<TenantRecord> {
        let mut registry = load_registry(&self.store)?;
        let record = record_mut(&mut registry, tenant_id)?;
        if !matches!(
            record.status,
            TenantStatus::Active | TenantStatus::Suspended
        ) {
            bail!("only active or suspended tenants can enter purging");
        }
        record.status = TenantStatus::Purging;
        record.purge_requested_at = Some(now_rfc3339());
        let record = record.clone();
        save_registry(&self.store, &registry)?;
        Ok(record)
    }

    /// Destroy the tenant data plane and retain a purge receipt.
    ///
    /// Two-phase on purpose: `confirmation` must repeat the tenant id exactly,
    /// and the receipt digest is computed from destroyed-state metadata so the
    /// deletion is auditable after the bytes are gone.
    pub fn confirm_purge(&self, tenant_id: &str, confirmation: &str) -> Result<TenantRecord> {
        if confirmation != tenant_id {
            bail!("purge confirmation must repeat the tenant id exactly");
        }
        let mut registry = load_registry(&self.store)?;
        let record = record_mut(&mut registry, tenant_id)?;
        if record.status != TenantStatus::Purging {
            bail!("tenant {tenant_id} has no recorded purge intent");
        }
        let store_path = std::path::Path::new(&record.store_path);
        if store_path.exists() {
            std::fs::remove_dir_all(store_path).with_context(|| {
                format!("failed to destroy data plane at {}", record.store_path)
            })?;
        }
        let purged_at = now_rfc3339();
        let mut hasher = Sha256::new();
        hasher.update(b"cortana.tenant.purge.v1");
        hasher.update(tenant_id.as_bytes());
        hasher.update(purged_at.as_bytes());
        hasher.update(record.store_path.as_bytes());
        let digest_bytes = hasher.finalize();
        let mut digest = String::with_capacity(digest_bytes.len() * 2);
        for byte in digest_bytes {
            use std::fmt::Write as _;
            write!(digest, "{byte:02x}").expect("formatting cannot fail");
        }
        let digest = format!("sha256:{digest}");
        record.status = TenantStatus::Purged;
        record.purged_at = Some(purged_at.clone());
        record.purge_receipt_digest = Some(digest);
        let record = record.clone();
        save_registry(&self.store, &registry)?;
        Ok(record)
    }

    /// JSON snapshot for operator surfaces; content never appears.
    pub fn status(&self) -> Result<serde_json::Value> {
        let registry = load_registry(&self.store)?;
        let counts = [
            TenantStatus::Active,
            TenantStatus::Suspended,
            TenantStatus::Purging,
            TenantStatus::Purged,
        ]
        .into_iter()
        .map(|status| {
            (
                serde_json::to_value(status).unwrap_or_default(),
                registry
                    .iter()
                    .filter(|record| record.status == status)
                    .count(),
            )
        })
        .collect::<Vec<_>>();
        Ok(json!({
            "contract_version": TENANT_CONTRACT,
            "tenants": registry.len(),
            "by_status": counts,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::tempdir;

    struct Fixture {
        _guard: tempfile::TempDir,
        control: TenantControlPlane,
        registry_path: PathBuf,
    }

    fn control_plane() -> Fixture {
        let guard = tempdir().expect("temp dir");
        let registry_path = guard.path().join("control-plane.sqlite3");
        let control = TenantControlPlane::open(&registry_path).expect("open control plane");
        Fixture {
            _guard: guard,
            control,
            registry_path,
        }
    }

    fn provision_request(store_path: PathBuf) -> ProvisionRequest {
        ProvisionRequest {
            name: "acme-personal".into(),
            residency: "eu-central".into(),
            source_of_truth: "cloud".into(),
            store_path,
            max_documents: 1_000_000,
            storage_quota_bytes: 10 * 1024 * 1024 * 1024,
            retention_days: 90,
        }
    }

    #[test]
    fn provision_creates_isolated_active_data_plane() {
        let fixture = control_plane();
        let store_path = fixture._guard.path().join("tenants").join("acme");
        let record = fixture
            .control
            .provision(&provision_request(store_path.clone()))
            .expect("provision");
        assert_eq!(record.status, TenantStatus::Active);
        assert_eq!(record.residency, "eu-central");
        assert_eq!(record.source_of_truth, "cloud");
        assert!(store_path.join("store.sqlite3").exists());

        // The data plane opens through the control plane and carries the
        // tenant marker.
        let data_plane = fixture
            .control
            .open_data_plane(&record.tenant_id)
            .expect("open data plane");
        let marker = data_plane.meta_get(DATA_PLANE_MARKER).expect("marker");
        assert_eq!(marker.as_deref(), Some(record.tenant_id.as_str()));
    }

    #[test]
    fn provision_rejects_registry_containment_and_duplicate_paths() {
        let fixture = control_plane();
        // A tenant directory that would contain the registry file itself is
        // refused, because purging it would destroy the control plane.
        let containing = fixture.registry_path.parent().unwrap().to_path_buf();
        assert!(
            fixture
                .control
                .provision(&provision_request(containing))
                .is_err()
        );

        let first = fixture._guard.path().join("tenants").join("first");
        fixture
            .control
            .provision(&provision_request(first.clone()))
            .expect("first provision");
        assert!(
            fixture
                .control
                .provision(&provision_request(first))
                .is_err(),
            "a store path can belong to only one tenant"
        );

        let bad = fixture._guard.path().join("tenants").join("bad");
        let mut request = provision_request(bad);
        request.source_of_truth = "shared".into();
        assert!(fixture.control.provision(&request).is_err());
    }

    #[test]
    fn suspended_tenants_cannot_open_until_reinstated() {
        let fixture = control_plane();
        let store_path = fixture._guard.path().join("tenants").join("acme");
        let record = fixture
            .control
            .provision(&provision_request(store_path))
            .expect("provision");
        fixture.control.suspend(&record.tenant_id).expect("suspend");
        assert!(
            fixture.control.open_data_plane(&record.tenant_id).is_err(),
            "suspended data planes must not open"
        );
        fixture
            .control
            .activate(&record.tenant_id)
            .expect("activate");
        assert!(fixture.control.open_data_plane(&record.tenant_id).is_ok());
        fixture
            .control
            .suspend(&record.tenant_id)
            .expect("re-suspend");
        assert!(
            fixture.control.suspend(&record.tenant_id).is_err(),
            "suspending a suspended tenant is invalid"
        );
    }

    #[test]
    fn purge_requires_intent_exact_confirmation_and_leaves_a_receipt() {
        let fixture = control_plane();
        let store_path = fixture._guard.path().join("tenants").join("acme");
        let record = fixture
            .control
            .provision(&provision_request(store_path.clone()))
            .expect("provision");

        // Wrong confirmation and missing intent both fail with bytes intact.
        assert!(
            fixture
                .control
                .confirm_purge(&record.tenant_id, "wrong")
                .is_err()
        );
        assert!(store_path.join("store.sqlite3").exists());
        assert!(
            fixture
                .control
                .confirm_purge(&record.tenant_id, &record.tenant_id)
                .is_err()
        );

        // Two-phase: intent, then confirmed destruction.
        fixture
            .control
            .request_purge(&record.tenant_id)
            .expect("request");
        assert!(fixture.control.open_data_plane(&record.tenant_id).is_err());
        let purged = fixture
            .control
            .confirm_purge(&record.tenant_id, &record.tenant_id)
            .expect("purge");
        assert_eq!(purged.status, TenantStatus::Purged);
        assert!(!store_path.exists(), "data plane bytes must be destroyed");
        assert!(purged.purge_receipt_digest.is_some());
        assert!(purged.purged_at.is_some());

        // The receipt is retained in the registry.
        let listed = fixture.control.list().expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].status, TenantStatus::Purged);
        assert_eq!(listed[0].purge_receipt_digest, purged.purge_receipt_digest);
    }

    #[test]
    fn swapped_data_plane_marker_is_detected() {
        let fixture = control_plane();
        let store_path = fixture._guard.path().join("tenants").join("acme");
        let record = fixture
            .control
            .provision(&provision_request(store_path))
            .expect("provision");
        let other = fixture
            .control
            .provision(&provision_request(
                fixture._guard.path().join("tenants").join("other"),
            ))
            .expect("provision other");

        // Overwrite the first tenant's marker with another tenant's identity.
        let data_plane =
            Store::open(&std::path::Path::new(&record.store_path).join("store.sqlite3"))
                .expect("open");
        data_plane
            .meta_set(DATA_PLANE_MARKER, &other.tenant_id)
            .expect("swap marker");
        assert!(
            fixture.control.open_data_plane(&record.tenant_id).is_err(),
            "a swapped data plane must be detected against the registry"
        );
    }

    #[test]
    fn status_reports_lifecycle_counts_without_content() {
        let fixture = control_plane();
        let status = fixture.control.status().expect("status");
        assert_eq!(status["contract_version"], TENANT_CONTRACT);
        assert_eq!(status["tenants"], 0);
        let serialized = status.to_string();
        assert!(
            !serialized.contains("store_path"),
            "status must not leak placement"
        );
    }
}
