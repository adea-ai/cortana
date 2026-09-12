//! Device identity and key lifecycle (`cortana.identity.device.v1`).
//!
//! Local-only, account-free foundation for the encrypted multi-device mode in
//! ADR 0003/0004: an account root secret with a derived Ed25519 root signing
//! key, per-device Ed25519/X25519 keypairs, a purpose-separated HKDF hierarchy,
//! and sealed-at-rest private material under an owner-held recovery key. The
//! registry persists in the store's meta table; public trust views never
//! contain secrets, and no operation contacts a network.

use anyhow::{Context, Result, bail};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD_NO_PAD as BASE64;
use chacha20poly1305::{
    ChaCha20Poly1305, Nonce,
    aead::{Aead, KeyInit},
};
use ed25519_dalek::{SigningKey, Verifier};
use hkdf::Hkdf;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt::Write as _;
use x25519_dalek::{PublicKey as AgreementPublic, StaticSecret as AgreementSecret};
use zeroize::Zeroize;

use crate::store::Store;

pub const CONTRACT_VERSION: &str = "cortana.identity.device.v1";
/// Suite tag for the HKDF/AEAD choices in ADR 0004; changes only with a
/// versioned migration, never as a key-rotation side effect.
pub const KEY_HIERARCHY_VERSION: &str = "kh1";
const META_KEY: &str = "device_identity.v1";
const ROOT_SECRET_BYTES: usize = 32;
const RECOVERY_SALT_BYTES: usize = 16;
const DEVICE_SECRET_BYTES: usize = 64;
const DEVICE_LIMIT: usize = 16;
const RETIRED_KEY_HISTORY_LIMIT: usize = 8;
const PURPOSE_ROOT_SIGNING: &str = "root-signing";
const AT_REST_SEAL_INFO: &str = "at-rest-seal";

/// Freshly generated owner-held recovery secret, displayed exactly once.
#[derive(Clone)]
pub struct RecoveryKey(String);

impl RecoveryKey {
    pub fn expose(&self) -> &str {
        &self.0
    }
}

/// Device keypairs held only in memory while mutating the registry.
struct DeviceSecrets {
    signing: SigningKey,
    agreement: AgreementSecret,
}

impl Drop for DeviceSecrets {
    fn drop(&mut self) {
        let mut seed = self.signing.to_bytes();
        seed.zeroize();
        let mut agreement = self.agreement.to_bytes();
        agreement.zeroize();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SealedBlob {
    pub nonce: String,
    pub ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum DeviceStatus {
    Active,
    Revoked { at: String },
    Wiped { at: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetiredPublicKey {
    pub fingerprint: String,
    pub signing_public: String,
    pub retired_at: String,
    pub key_version: u32,
}

/// Public trust view of one device; never contains secrets.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceSummary {
    pub device_id: String,
    pub name: String,
    pub fingerprint: String,
    pub signing_public: String,
    pub agreement_public: String,
    pub key_version: u32,
    pub status: DeviceStatus,
    pub created_at: String,
    pub rotated_at: Option<String>,
    pub last_seen: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceEntry {
    #[serde(flatten)]
    summary: DeviceSummary,
    /// Sealed signing+agreement seeds; `None` once the device is wiped.
    sealed_secrets: Option<SealedBlob>,
    retired_public_keys: Vec<RetiredPublicKey>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Registry {
    pub contract_version: String,
    pub key_hierarchy_version: String,
    pub account_id: String,
    pub created_at: String,
    pub root_generation: u32,
    pub salt: String,
    pub root_signing_public: String,
    pub sealed_root_secret: SealedBlob,
    pub devices: Vec<DeviceEntry>,
}

/// Returned once by [`initialize`]; the recovery key is never persisted.
pub struct InitializedIdentity {
    pub registry: Registry,
    pub recovery_key: RecoveryKey,
    pub local_device: DeviceSummary,
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn random_bytes(length: usize) -> Result<Vec<u8>> {
    let mut buffer = vec![0u8; length];
    getrandom::getrandom(&mut buffer)
        .map_err(|error| anyhow::anyhow!("secure randomness unavailable: {error}"))?;
    Ok(buffer)
}

fn encode_blob(nonce: &[u8], ciphertext: &[u8]) -> SealedBlob {
    SealedBlob {
        nonce: BASE64.encode(nonce),
        ciphertext: BASE64.encode(ciphertext),
    }
}

fn seal(key: &[u8; 32], plaintext: &[u8]) -> Result<SealedBlob> {
    let cipher = ChaCha20Poly1305::new_from_slice(key)?;
    let nonce_bytes = random_bytes(12)?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| anyhow::anyhow!("identity sealing failed"))?;
    Ok(encode_blob(&nonce_bytes, &ciphertext))
}

fn unseal(key: &[u8; 32], blob: &SealedBlob) -> Result<Vec<u8>> {
    let cipher = ChaCha20Poly1305::new_from_slice(key)?;
    let nonce_bytes = BASE64
        .decode(&blob.nonce)
        .context("sealed identity nonce is not valid base64")?;
    let ciphertext = BASE64
        .decode(&blob.ciphertext)
        .context("sealed identity ciphertext is not valid base64")?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| anyhow::anyhow!("sealed identity material failed to open"))
}

/// Derive the at-rest sealing key from the owner recovery key and registry salt.
fn storage_seal_key(recovery_key: &str, salt: &[u8]) -> Result<[u8; 32]> {
    let recovery_bytes = BASE64
        .decode(recovery_key.trim())
        .context("recovery key is not valid base64")?;
    if recovery_bytes.len() != ROOT_SECRET_BYTES {
        bail!(
            "recovery key must decode to {ROOT_SECRET_BYTES} bytes, got {}",
            recovery_bytes.len()
        );
    }
    derive_key(&recovery_bytes, salt, AT_REST_SEAL_INFO)
}

/// HKDF-SHA256 with domain-separated, version-bound info per ADR 0004.
fn derive_key(ikm: &[u8], salt: &[u8], purpose: &str) -> Result<[u8; 32]> {
    let hkdf = Hkdf::<Sha256>::new(Some(salt), ikm);
    let info = format!("{CONTRACT_VERSION}/{KEY_HIERARCHY_VERSION}/{purpose}");
    let mut okm = [0u8; 32];
    hkdf.expand(info.as_bytes(), &mut okm)?;
    Ok(okm)
}

/// Derive a purpose key from the root secret for the given generation.
///
/// Purpose keys for retired generations never derive again once the root
/// secret rotates, which is what cuts off revoked devices.
pub fn purpose_key(root_secret: &[u8; 32], generation: u32, purpose: &str) -> Result<[u8; 32]> {
    derive_key(root_secret, &generation.to_be_bytes(), purpose)
}

fn fingerprint(signing_public: &[u8]) -> String {
    let digest = Sha256::digest(signing_public);
    let mut short = String::with_capacity(16);
    for byte in &digest[..8] {
        write!(short, "{byte:02x}").expect("formatting cannot fail");
    }
    format!("sha256:{short}")
}

fn generate_device_secrets() -> Result<DeviceSecrets> {
    let mut signing_seed = [0u8; 32];
    getrandom::getrandom(&mut signing_seed)
        .map_err(|error| anyhow::anyhow!("secure randomness unavailable: {error}"))?;
    let mut agreement_seed = [0u8; 32];
    getrandom::getrandom(&mut agreement_seed)
        .map_err(|error| anyhow::anyhow!("secure randomness unavailable: {error}"))?;
    Ok(DeviceSecrets {
        signing: SigningKey::from_bytes(&signing_seed),
        agreement: AgreementSecret::from(agreement_seed),
    })
}

fn seal_device_secrets(seal_key: &[u8; 32], secrets: &DeviceSecrets) -> Result<SealedBlob> {
    let mut material = Vec::with_capacity(DEVICE_SECRET_BYTES);
    material.extend_from_slice(&secrets.signing.to_bytes());
    material.extend_from_slice(&secrets.agreement.to_bytes());
    let sealed = seal(seal_key, &material);
    material.zeroize();
    sealed
}

fn unseal_device_secrets(seal_key: &[u8; 32], blob: &SealedBlob) -> Result<DeviceSecrets> {
    let mut material = unseal(seal_key, blob)?;
    if material.len() != DEVICE_SECRET_BYTES {
        material.zeroize();
        bail!("sealed device material has an unexpected length");
    }
    let mut signing_seed = [0u8; 32];
    signing_seed.copy_from_slice(&material[..32]);
    let mut agreement_seed = [0u8; 32];
    agreement_seed.copy_from_slice(&material[32..]);
    material.zeroize();
    Ok(DeviceSecrets {
        signing: SigningKey::from_bytes(&signing_seed),
        agreement: AgreementSecret::from(agreement_seed),
    })
}

fn summary_from_entry(entry: &DeviceEntry) -> DeviceSummary {
    entry.summary.clone()
}

fn audit(store: &Store, action: &str, outcome: &str, audit_max: usize) {
    let _ = store.record_audit("owner", action, None, None, outcome, None, 0, audit_max);
}

/// Prove the recovery key opens this registry before any sealing mutation.
///
/// Without this check a mistyped recovery key would silently re-seal material
/// under the wrong key and corrupt the registry.
fn verify_recovery_possession(seal_key: &[u8; 32], registry: &Registry) -> Result<()> {
    let mut root_secret = unseal(seal_key, &registry.sealed_root_secret)
        .map_err(|_| anyhow::anyhow!("recovery key does not open this identity registry"))?;
    root_secret.zeroize();
    Ok(())
}

fn require_active(entry: &DeviceEntry) -> Result<()> {
    match entry.summary.status {
        DeviceStatus::Active => Ok(()),
        DeviceStatus::Revoked { .. } => bail!("device {} is revoked", entry.summary.device_id),
        DeviceStatus::Wiped { .. } => bail!("device {} is wiped", entry.summary.device_id),
    }
}

/// Create the account root and the local device, returning the recovery key.
///
/// The recovery key exists only in the returned value; losing it after losing
/// every enrolled device permanently loses sealed material.
pub fn initialize(
    store: &Store,
    device_name: &str,
    audit_max: usize,
) -> Result<InitializedIdentity> {
    if load(store)?.is_some() {
        bail!("device identity already initialized for this store");
    }
    if device_name.trim().is_empty() {
        bail!("device name cannot be empty");
    }
    let recovery_bytes = random_bytes(ROOT_SECRET_BYTES)?;
    let recovery_key = RecoveryKey(BASE64.encode(&recovery_bytes));
    let mut root_secret = random_bytes(ROOT_SECRET_BYTES)?;
    let salt = random_bytes(RECOVERY_SALT_BYTES)?;
    let seal_key = storage_seal_key(recovery_key.expose(), &salt)?;

    let root_signing = SigningKey::from_bytes(&purpose_key(
        root_secret.as_slice().try_into()?,
        0,
        PURPOSE_ROOT_SIGNING,
    )?);
    let sealed_root_secret = seal(&seal_key, &root_secret)?;

    let secrets = generate_device_secrets()?;
    let sealed_secrets = seal_device_secrets(&seal_key, &secrets)?;
    let summary = DeviceSummary {
        device_id: uuid::Uuid::new_v4().to_string(),
        name: device_name.trim().to_string(),
        fingerprint: fingerprint(secrets.signing.verifying_key().as_bytes()),
        signing_public: BASE64.encode(secrets.signing.verifying_key().as_bytes()),
        agreement_public: BASE64.encode(AgreementPublic::from(&secrets.agreement).as_bytes()),
        key_version: 1,
        status: DeviceStatus::Active,
        created_at: now_rfc3339(),
        rotated_at: None,
        last_seen: None,
    };

    let registry = Registry {
        contract_version: CONTRACT_VERSION.to_string(),
        key_hierarchy_version: KEY_HIERARCHY_VERSION.to_string(),
        account_id: uuid::Uuid::new_v4().to_string(),
        created_at: now_rfc3339(),
        root_generation: 0,
        salt: BASE64.encode(&salt),
        root_signing_public: BASE64.encode(root_signing.verifying_key().as_bytes()),
        sealed_root_secret,
        devices: vec![DeviceEntry {
            summary,
            sealed_secrets: Some(sealed_secrets),
            retired_public_keys: Vec::new(),
        }],
    };
    root_secret.zeroize();
    drop(secrets);
    save(store, &registry)?;
    audit(store, "identity.initialize", "ok", audit_max);
    let local_device = registry.devices[0].summary.clone();
    Ok(InitializedIdentity {
        registry,
        recovery_key,
        local_device,
    })
}

/// Load the registry, or `None` when identity was never initialized.
pub fn load(store: &Store) -> Result<Option<Registry>> {
    let Some(raw) = store.meta_get(META_KEY)? else {
        return Ok(None);
    };
    serde_json::from_str(&raw)
        .map(Some)
        .with_context(|| format!("stored {CONTRACT_VERSION} registry is not valid JSON"))
}

/// Persist the registry after a mutation.
pub fn save(store: &Store, registry: &Registry) -> Result<()> {
    if registry.contract_version != CONTRACT_VERSION {
        bail!(
            "registry contract version {} is not supported",
            registry.contract_version
        );
    }
    if registry.key_hierarchy_version != KEY_HIERARCHY_VERSION {
        bail!(
            "registry key hierarchy {} is not supported",
            registry.key_hierarchy_version
        );
    }
    let serialized = serde_json::to_string(registry)?;
    store.meta_set(META_KEY, &serialized)
}

/// Public trust view of every device; secrets never appear.
pub fn trust_view(registry: &Registry) -> Vec<DeviceSummary> {
    registry.devices.iter().map(summary_from_entry).collect()
}

/// Enroll a new device with freshly generated keys sealed under the recovery key.
pub fn enroll(
    store: &Store,
    registry: &mut Registry,
    recovery_key: &str,
    device_name: &str,
    audit_max: usize,
) -> Result<DeviceSummary> {
    if registry.devices.len() >= DEVICE_LIMIT {
        bail!("device limit of {DEVICE_LIMIT} reached; revoke or wipe a device first");
    }
    if device_name.trim().is_empty() {
        bail!("device name cannot be empty");
    }
    let seal_key = storage_seal_key(recovery_key, &BASE64.decode(&registry.salt)?)?;
    verify_recovery_possession(&seal_key, registry)?;
    let secrets = generate_device_secrets()?;
    let sealed_secrets = seal_device_secrets(&seal_key, &secrets)?;
    let summary = DeviceSummary {
        device_id: uuid::Uuid::new_v4().to_string(),
        name: device_name.trim().to_string(),
        fingerprint: fingerprint(secrets.signing.verifying_key().as_bytes()),
        signing_public: BASE64.encode(secrets.signing.verifying_key().as_bytes()),
        agreement_public: BASE64.encode(AgreementPublic::from(&secrets.agreement).as_bytes()),
        key_version: 1,
        status: DeviceStatus::Active,
        created_at: now_rfc3339(),
        rotated_at: None,
        last_seen: None,
    };
    registry.devices.push(DeviceEntry {
        summary,
        sealed_secrets: Some(sealed_secrets),
        retired_public_keys: Vec::new(),
    });
    drop(secrets);
    save(store, registry)?;
    audit(store, "identity.enroll", "ok", audit_max);
    Ok(summary_from_entry(
        registry.devices.last().expect("enrolled device"),
    ))
}

/// Replace a device's keypairs, advancing its key version.
pub fn rotate_device(
    store: &Store,
    registry: &mut Registry,
    recovery_key: &str,
    device_id: &str,
    audit_max: usize,
) -> Result<DeviceSummary> {
    let seal_key = storage_seal_key(recovery_key, &BASE64.decode(&registry.salt)?)?;
    verify_recovery_possession(&seal_key, registry)?;
    let entry = device_entry_mut(registry, device_id)?;
    require_active(entry)?;
    let secrets = generate_device_secrets()?;
    let sealed_secrets = seal_device_secrets(&seal_key, &secrets)?;
    let summary = &mut entry.summary;
    if summary.key_version == u32::MAX {
        bail!("device key version exhausted");
    }
    entry.retired_public_keys.push(RetiredPublicKey {
        fingerprint: summary.fingerprint.clone(),
        signing_public: summary.signing_public.clone(),
        retired_at: now_rfc3339(),
        key_version: summary.key_version,
    });
    if entry.retired_public_keys.len() > RETIRED_KEY_HISTORY_LIMIT {
        entry.retired_public_keys.remove(0);
    }
    summary.fingerprint = fingerprint(secrets.signing.verifying_key().as_bytes());
    summary.signing_public = BASE64.encode(secrets.signing.verifying_key().as_bytes());
    summary.agreement_public = BASE64.encode(AgreementPublic::from(&secrets.agreement).as_bytes());
    summary.key_version += 1;
    summary.rotated_at = Some(now_rfc3339());
    entry.sealed_secrets = Some(sealed_secrets);
    drop(secrets);
    let summary = entry.summary.clone();
    save(store, registry)?;
    audit(store, "identity.rotate_device", "ok", audit_max);
    Ok(summary)
}

/// Revoke a device: it can never derive post-revocation purpose keys.
pub fn revoke_device(
    store: &Store,
    registry: &mut Registry,
    device_id: &str,
    audit_max: usize,
) -> Result<DeviceSummary> {
    let entry = device_entry_mut(registry, device_id)?;
    require_active(entry)?;
    entry.summary.status = DeviceStatus::Revoked { at: now_rfc3339() };
    let summary = entry.summary.clone();
    save(store, registry)?;
    audit(store, "identity.revoke_device", "ok", audit_max);
    Ok(summary)
}

/// Wipe a device: destroy its sealed material and mark it unrecoverable here.
pub fn wipe_device(
    store: &Store,
    registry: &mut Registry,
    device_id: &str,
    audit_max: usize,
) -> Result<DeviceSummary> {
    let entry = device_entry_mut(registry, device_id)?;
    if matches!(entry.summary.status, DeviceStatus::Wiped { .. }) {
        bail!("device {device_id} is already wiped");
    }
    entry.summary.status = DeviceStatus::Wiped { at: now_rfc3339() };
    entry.sealed_secrets = None;
    let summary = entry.summary.clone();
    save(store, registry)?;
    audit(store, "identity.wipe_device", "ok", audit_max);
    Ok(summary)
}

/// Re-seal all retained private material under a new recovery key.
///
/// Device and purpose keys are untouched; only the at-rest sealing changes.
pub fn recover(
    store: &Store,
    registry: &mut Registry,
    current_recovery_key: &str,
    new_recovery_key: &str,
    audit_max: usize,
) -> Result<()> {
    if new_recovery_key.trim() == current_recovery_key.trim() {
        bail!("new recovery key must differ from the current recovery key");
    }
    let salt = BASE64.decode(&registry.salt)?;
    let current_seal_key = storage_seal_key(current_recovery_key, &salt)?;
    let new_seal_key = storage_seal_key(new_recovery_key, &salt)?;

    let mut root_secret = unseal(&current_seal_key, &registry.sealed_root_secret)?;
    let sealed_root_secret = seal(&new_seal_key, &root_secret)?;
    root_secret.zeroize();

    let mut resealed = Vec::new();
    for entry in &registry.devices {
        match &entry.sealed_secrets {
            Some(blob) => {
                let mut material = unseal(&current_seal_key, blob)?;
                resealed.push(seal(&new_seal_key, &material)?);
                material.zeroize();
            }
            None => resealed.push(SealedBlob {
                nonce: String::new(),
                ciphertext: String::new(),
            }),
        }
    }
    registry.sealed_root_secret = sealed_root_secret;
    for (entry, blob) in registry.devices.iter_mut().zip(resealed) {
        if entry.sealed_secrets.is_some() {
            entry.sealed_secrets = Some(blob);
        }
    }
    save(store, registry)?;
    audit(store, "identity.recover", "ok", audit_max);
    Ok(())
}

/// Rotate the account root secret and signing key, advancing the generation.
///
/// Purpose keys for the previous generation stop deriving. Revoked and wiped
/// devices never receive the new root material in any future sync protocol.
pub fn rotate_root(
    store: &Store,
    registry: &mut Registry,
    recovery_key: &str,
    audit_max: usize,
) -> Result<()> {
    let seal_key = storage_seal_key(recovery_key, &BASE64.decode(&registry.salt)?)?;
    verify_recovery_possession(&seal_key, registry)?;
    let mut root_secret = random_bytes(ROOT_SECRET_BYTES)?;
    let root_signing = SigningKey::from_bytes(&purpose_key(
        root_secret.as_slice().try_into()?,
        registry.root_generation + 1,
        PURPOSE_ROOT_SIGNING,
    )?);
    let sealed_root_secret = seal(&seal_key, &root_secret)?;
    root_secret.zeroize();
    registry.root_generation += 1;
    registry.root_signing_public = BASE64.encode(root_signing.verifying_key().as_bytes());
    registry.sealed_root_secret = sealed_root_secret;
    save(store, registry)?;
    audit(store, "identity.rotate_root", "ok", audit_max);
    Ok(())
}

/// Unseal a device's signing key to prove possession for the trust view.
///
/// Verification-only helper for local diagnostics and future sync handshakes.
pub fn verify_device_signature(
    registry: &Registry,
    recovery_key: &str,
    device_id: &str,
    message: &[u8],
    signature: &[u8],
) -> Result<bool> {
    let seal_key = storage_seal_key(recovery_key, &BASE64.decode(&registry.salt)?)?;
    let entry = registry
        .devices
        .iter()
        .find(|entry| entry.summary.device_id == device_id)
        .ok_or_else(|| anyhow::anyhow!("unknown device {device_id}"))?;
    let Some(blob) = &entry.sealed_secrets else {
        bail!("device {device_id} has no retained secret material");
    };
    let secrets = unseal_device_secrets(&seal_key, blob)?;
    let signature =
        ed25519_dalek::Signature::from_slice(signature).context("signature encoding is invalid")?;
    Ok(secrets
        .signing
        .verifying_key()
        .verify(message, &signature)
        .is_ok())
}

fn device_entry_mut<'a>(
    registry: &'a mut Registry,
    device_id: &str,
) -> Result<&'a mut DeviceEntry> {
    registry
        .devices
        .iter_mut()
        .find(|entry| entry.summary.device_id == device_id)
        .ok_or_else(|| anyhow::anyhow!("unknown device {device_id}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::Signer;
    use tempfile::tempdir;

    fn test_store() -> (tempfile::TempDir, Store) {
        let directory = tempdir().expect("temporary directory");
        let store = Store::open(&directory.path().join("store.sqlite3")).expect("open store");
        (directory, store)
    }

    fn initialized() -> (tempfile::TempDir, Store, Registry, String) {
        let (directory, store) = test_store();
        let outcome = initialize(&store, "local", 100).expect("initialize");
        (
            directory,
            store,
            outcome.registry,
            outcome.recovery_key.expose().to_string(),
        )
    }

    fn local_device_id(registry: &Registry) -> String {
        registry.devices[0].summary.device_id.clone()
    }

    fn sign_local_device(
        registry: &Registry,
        recovery: &str,
        device_id: &str,
        message: &[u8],
    ) -> Vec<u8> {
        let seal_key = storage_seal_key(recovery, &BASE64.decode(&registry.salt).expect("salt"))
            .expect("seal key");
        let entry = registry
            .devices
            .iter()
            .find(|entry| entry.summary.device_id == device_id)
            .expect("device");
        let blob = entry.sealed_secrets.as_ref().expect("sealed secrets");
        let secrets = unseal_device_secrets(&seal_key, blob).expect("unseal device");
        secrets.signing.sign(message).to_bytes().to_vec()
    }

    #[test]
    fn initialize_creates_active_local_device_and_persists_registry() {
        let (_guard, store, registry, recovery) = initialized();
        let reloaded = load(&store).expect("load").expect("registry present");
        assert_eq!(reloaded.account_id, registry.account_id);
        assert_eq!(reloaded.devices.len(), 1);
        assert_eq!(reloaded.devices[0].summary.name, "local");
        assert_eq!(reloaded.devices[0].summary.status, DeviceStatus::Active);
        assert_eq!(reloaded.contract_version, CONTRACT_VERSION);
        assert!(!recovery.is_empty());

        let view = trust_view(&reloaded);
        assert_eq!(view.len(), 1);
        let serialized = serde_json::to_string(&view).expect("serialize trust view");
        assert!(
            !serialized.contains(&recovery),
            "trust view leaked recovery key"
        );
    }

    #[test]
    fn initialize_twice_fails() {
        let (_guard, store, _registry, _recovery) = initialized();
        assert!(initialize(&store, "second", 100).is_err());
    }

    #[test]
    fn wrong_recovery_key_cannot_rotate_or_recover() {
        let (_guard, store, mut registry, _recovery) = initialized();
        let device_id = local_device_id(&registry);
        let wrong = BASE64.encode(random_bytes(32).expect("random"));
        assert!(rotate_device(&store, &mut registry, &wrong, &device_id, 100).is_err());
        let fresh = BASE64.encode(random_bytes(32).expect("random"));
        assert!(recover(&store, &mut registry, &wrong, &fresh, 100).is_err());
        assert!(load(&store).expect("load").is_some());
    }

    #[test]
    fn recover_requires_distinct_new_recovery_key() {
        let (_guard, store, mut registry, recovery) = initialized();
        assert!(recover(&store, &mut registry, &recovery, &recovery, 100).is_err());
    }

    #[test]
    fn purpose_keys_are_deterministic_and_purpose_separated() {
        let root = [7u8; 32];
        let first = purpose_key(&root, 0, "payload").expect("derive");
        let again = purpose_key(&root, 0, "payload").expect("derive");
        let other = purpose_key(&root, 0, "metadata").expect("derive");
        let next_generation = purpose_key(&root, 1, "payload").expect("derive");
        assert_eq!(first, again);
        assert_ne!(first, other);
        assert_ne!(first, next_generation);
    }

    #[test]
    fn enroll_adds_active_device_with_distinct_keys() {
        let (_guard, store, mut registry, recovery) = initialized();
        let first_fingerprint = registry.devices[0].summary.fingerprint.clone();
        let enrolled = enroll(&store, &mut registry, &recovery, "laptop", 100).expect("enroll");
        assert_eq!(registry.devices.len(), 2);
        assert_eq!(enrolled.name, "laptop");
        assert_eq!(enrolled.status, DeviceStatus::Active);
        assert_ne!(enrolled.fingerprint, first_fingerprint);
        assert_ne!(enrolled.device_id, registry.devices[0].summary.device_id);
    }

    #[test]
    fn rotate_device_advances_version_and_keeps_history() {
        let (_guard, store, mut registry, recovery) = initialized();
        let device_id = local_device_id(&registry);
        let before = registry
            .devices
            .iter()
            .find(|entry| entry.summary.device_id == device_id)
            .expect("device")
            .clone();
        let rotated =
            rotate_device(&store, &mut registry, &recovery, &device_id, 100).expect("rotate");
        assert_eq!(rotated.key_version, before.summary.key_version + 1);
        assert_ne!(rotated.fingerprint, before.summary.fingerprint);
        assert!(rotated.rotated_at.is_some());
        let entry = registry
            .devices
            .iter()
            .find(|entry| entry.summary.device_id == device_id)
            .expect("device");
        assert_eq!(entry.retired_public_keys.len(), 1);
        assert_eq!(
            entry.retired_public_keys[0].fingerprint,
            before.summary.fingerprint
        );
    }

    #[test]
    fn revoked_device_rejects_rotation_and_reports_revocation() {
        let (_guard, store, mut registry, recovery) = initialized();
        let device_id = local_device_id(&registry);
        revoke_device(&store, &mut registry, &device_id, 100).expect("revoke");
        assert!(rotate_device(&store, &mut registry, &recovery, &device_id, 100).is_err());
        assert!(revoke_device(&store, &mut registry, &device_id, 100).is_err());
        let reloaded = load(&store).expect("load").expect("registry");
        let entry = reloaded
            .devices
            .iter()
            .find(|entry| entry.summary.device_id == device_id)
            .expect("device");
        assert!(matches!(entry.summary.status, DeviceStatus::Revoked { .. }));
        assert!(
            entry.sealed_secrets.is_some(),
            "revocation keeps material for owner-led wipe"
        );
    }

    #[test]
    fn wipe_destroys_sealed_material_and_blocks_further_ops() {
        let (_guard, store, mut registry, _recovery) = initialized();
        let device_id = local_device_id(&registry);
        wipe_device(&store, &mut registry, &device_id, 100).expect("wipe");
        let reloaded = load(&store).expect("load").expect("registry");
        let entry = reloaded
            .devices
            .iter()
            .find(|entry| entry.summary.device_id == device_id)
            .expect("device");
        assert!(entry.sealed_secrets.is_none());
        assert!(wipe_device(&store, &mut registry, &device_id, 100).is_err());
        assert!(revoke_device(&store, &mut registry, &device_id, 100).is_err());
    }

    #[test]
    fn recover_reseals_under_new_key_and_old_key_stops_working() {
        let (_guard, store, mut registry, recovery) = initialized();
        enroll(&store, &mut registry, &recovery, "tablet", 100).expect("enroll");
        let fresh = BASE64.encode(random_bytes(32).expect("random"));
        recover(&store, &mut registry, &recovery, &fresh, 100).expect("recover");

        let device_id = local_device_id(&registry);
        assert!(rotate_device(&store, &mut registry, &recovery, &device_id, 100).is_err());
        let rotated = rotate_device(&store, &mut registry, &fresh, &device_id, 100)
            .expect("rotate with new recovery key");
        assert_eq!(rotated.key_version, 2);

        let reloaded = load(&store).expect("load").expect("registry");
        let signature = sign_local_device(&reloaded, &fresh, &device_id, b"trust message");
        assert!(
            verify_device_signature(&reloaded, &fresh, &device_id, b"trust message", &signature,)
                .expect("verify")
        );
    }

    #[test]
    fn rotate_root_advances_generation_and_replaces_root_public_key() {
        let (_guard, store, mut registry, recovery) = initialized();
        let previous_public = registry.root_signing_public.clone();
        let previous_generation = registry.root_generation;
        rotate_root(&store, &mut registry, &recovery, 100).expect("rotate root");
        assert_eq!(registry.root_generation, previous_generation + 1);
        assert_ne!(registry.root_signing_public, previous_public);
    }

    #[test]
    fn device_signature_verifies_and_detects_tampering() {
        let (_guard, _store, registry, recovery) = initialized();
        let device_id = local_device_id(&registry);
        let message = b"cortana trust message";
        let signature = sign_local_device(&registry, &recovery, &device_id, message);
        assert!(
            verify_device_signature(&registry, &recovery, &device_id, message, &signature)
                .expect("verify")
        );
        let mut tampered = signature.clone();
        tampered[0] ^= 0xff;
        assert!(
            !verify_device_signature(&registry, &recovery, &device_id, message, &tampered)
                .expect("verify tampered")
        );
        assert!(
            !verify_device_signature(&registry, &recovery, &device_id, b"other", &signature)
                .expect("verify wrong message")
        );
    }

    #[test]
    fn device_limit_blocks_enrollment() {
        let (_guard, store, mut registry, recovery) = initialized();
        while registry.devices.len() < DEVICE_LIMIT {
            let mut clone = registry.devices[0].clone();
            clone.summary.device_id = uuid::Uuid::new_v4().to_string();
            registry.devices.push(clone);
        }
        assert!(enroll(&store, &mut registry, &recovery, "overflow", 100).is_err());
    }

    #[test]
    fn identity_ops_write_metadata_only_audit_events() {
        let (_guard, store, mut registry, recovery) = initialized();
        enroll(&store, &mut registry, &recovery, "laptop", 100).expect("enroll");
        let events = store.audit_events(10).expect("audit events");
        assert!(
            events
                .iter()
                .any(|event| event.action == "identity.initialize" && event.principal == "owner"),
            "initialize audit event missing"
        );
        assert!(
            events
                .iter()
                .any(|event| event.action == "identity.enroll" && event.principal == "owner"),
            "enroll audit event missing"
        );
        let serialized = serde_json::to_string(&events).expect("serialize events");
        assert!(!serialized.contains(&recovery), "audit leaked recovery key");
    }
}
