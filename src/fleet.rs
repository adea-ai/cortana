//! Connector fleet task grants and result envelopes (`cortana.fleet.v1`).
//!
//! Implements the protocol core of ADR 0005 on top of the device identity
//! layer: the owner node signs bounded, expiring task grants for one worker
//! device each; workers return observations in result envelopes sealed back
//! to the owner device. Grants carry credential references, never secrets;
//! envelopes carry observations only — deletion and reconciliation authority
//! never leaves the owner node.

use anyhow::{Context, Result, bail};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD_NO_PAD as BASE64;
use chacha20poly1305::{
    ChaCha20Poly1305, Nonce,
    aead::{Aead, KeyInit, Payload},
};
use ed25519_dalek::{Signer, Verifier, VerifyingKey};
use hkdf::Hkdf;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::device_identity::{
    DeviceStatus, Registry, fingerprint, random_bytes, storage_seal_key, unseal_self_secrets,
};
use crate::store::Store;
use x25519_dalek::PublicKey as AgreementPublic;
use zeroize::Zeroize;

pub const FLEET_CONTRACT: &str = "cortana.fleet.v1";

/// What one worker device may do for one job until expiry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaskGrantClaims {
    pub token_id: String,
    pub job_id: String,
    pub capability: String,
    pub workspace: String,
    pub source_scope: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credential_reference: Option<String>,
    pub max_documents: u32,
    pub max_bytes: u64,
    pub issued_at: String,
    pub expires_at: String,
    pub audience: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskGrant {
    pub format: String,
    pub claims: Value,
    pub issuer_device: String,
    pub signature: String,
}

/// Issuance request for [`issue_task_grant`].
#[derive(Debug, Clone)]
pub struct TaskGrantRequest {
    pub audience: String,
    pub job_id: String,
    pub capability: String,
    pub workspace: String,
    pub source_scope: Vec<String>,
    pub credential_reference: Option<String>,
    pub ttl_seconds: i64,
    pub max_documents: u32,
    pub max_bytes: u64,
}

fn sign_bytes(signing: &ed25519_dalek::SigningKey, message: &[u8]) -> String {
    BASE64.encode(signing.sign(message).to_bytes())
}

fn verify_signature(verifying: &VerifyingKey, message: &[u8], signature_b64: &str) -> Result<()> {
    let signature = BASE64
        .decode(signature_b64)
        .context("signature is not valid base64")
        .and_then(|bytes| {
            ed25519_dalek::Signature::from_slice(&bytes).context("signature encoding is invalid")
        })?;
    verifying
        .verify(message, &signature)
        .map_err(|_| anyhow::anyhow!("signature verification failed"))
}

fn device_entry<'a>(
    registry: &'a Registry,
    device_id: &str,
) -> Result<&'a crate::device_identity::DeviceEntry> {
    // DeviceEntry import currently unused otherwise
    registry
        .devices
        .iter()
        .find(|entry| entry.summary.device_id == device_id)
        .ok_or_else(|| anyhow::anyhow!("unknown device {device_id}"))
}

fn require_active(registry: &Registry, device_id: &str) -> Result<()> {
    let entry = device_entry(registry, device_id)?;
    if matches!(entry.summary.status, DeviceStatus::Active) {
        Ok(())
    } else {
        bail!("device {device_id} is not active")
    }
}

fn self_device(store: &Store) -> Result<String> {
    store
        .meta_get(crate::sync_engine::SYNC_SELF_DEVICE_META)?
        .ok_or_else(|| anyhow::anyhow!("this store has no adopted device identity"))
}

/// Issue a signed task grant for one worker device.
///
/// The grant carries a credential reference, never a secret, and expires
/// against the executor's clock.
pub fn issue_task_grant(
    store: &Store,
    registry: &Registry,
    recovery_key: &str,
    request: &TaskGrantRequest,
) -> Result<TaskGrant> {
    let issuer = self_device(store)?;
    if issuer == request.audience {
        bail!("a device cannot issue a fleet grant to itself");
    }
    require_active(registry, &request.audience)?;
    let seal_key = storage_seal_key(recovery_key, &BASE64.decode(&registry.salt)?)?;
    let secrets = unseal_self_secrets(&seal_key, registry, &issuer)?;

    let now = chrono::Utc::now();
    let claims = json!(TaskGrantClaims {
        token_id: uuid::Uuid::new_v4().to_string(),
        job_id: request.job_id.clone(),
        capability: request.capability.clone(),
        workspace: request.workspace.clone(),
        source_scope: request.source_scope.clone(),
        credential_reference: request.credential_reference.clone(),
        max_documents: request.max_documents,
        max_bytes: request.max_bytes,
        issued_at: now.to_rfc3339(),
        expires_at: (now + chrono::Duration::seconds(request.ttl_seconds)).to_rfc3339(),
        audience: request.audience.clone(),
    });
    let claims_bytes = serde_json::to_vec(&claims)?;
    Ok(TaskGrant {
        format: FLEET_CONTRACT.to_string(),
        signature: sign_bytes(&secrets.signing, &claims_bytes),
        issuer_device: issuer,
        claims,
    })
}

/// Verify a task grant as the audience device.
///
/// Checks the envelope format, the issuer's signature against the local
/// trust view, that the issuer is Active, that this store is the audience,
/// and that the grant has not expired at `now`.
pub fn verify_task_grant(
    store: &Store,
    registry: &Registry,
    token: &TaskGrant,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<TaskGrantClaims> {
    if token.format != FLEET_CONTRACT {
        bail!("unrecognized fleet grant format");
    }
    let audience = self_device(store)?;
    let issuer_entry = device_entry(registry, &token.issuer_device)?;
    require_active(registry, &token.issuer_device)?;
    let issuer_public = BASE64
        .decode(&issuer_entry.summary.signing_public)
        .context("issuer signing key is not valid base64")?;
    let verifying = VerifyingKey::from_bytes(
        issuer_public
            .as_slice()
            .try_into()
            .context("issuer signing key has the wrong length")?,
    )?;
    let claims_bytes = serde_json::to_vec(&token.claims)?;
    verify_signature(&verifying, &claims_bytes, &token.signature)?;
    let claims: TaskGrantClaims =
        serde_json::from_value(token.claims.clone()).context("grant claims are not valid")?;
    if claims.audience != audience {
        bail!("grant is addressed to device {}", claims.audience);
    }
    let expires_at = chrono::DateTime::parse_from_rfc3339(&claims.expires_at)
        .context("grant expiry is not a valid timestamp")?
        .with_timezone(&chrono::Utc);
    if now >= expires_at {
        bail!("grant expired at {}", claims.expires_at);
    }
    Ok(claims)
}

/// Seal a result envelope for the grant's issuer device.
///
/// Confidentiality comes from static-static X25519 agreement between the
/// worker and owner device keys; authenticity from the worker's Ed25519
/// signature over header and ciphertext. The token id binds the envelope to
/// its grant so the owner can enforce idempotent delivery.
pub fn seal_result(
    store: &Store,
    registry: &Registry,
    recovery_key: &str,
    token: &TaskGrant,
    payload: &[u8],
) -> Result<Vec<u8>> {
    let executor = self_device(store)?;
    let claims: TaskGrantClaims =
        serde_json::from_value(token.claims.clone()).context("grant claims are not valid")?;
    if claims.audience != executor {
        bail!("this store is not the grant audience");
    }
    let owner_entry = device_entry(registry, &token.issuer_device)?;
    let owner_agreement = BASE64
        .decode(&owner_entry.summary.agreement_public)
        .context("owner agreement key is not valid base64")?;
    let mut owner_key = [0u8; 32];
    owner_key.copy_from_slice(&owner_agreement);

    let seal_key = storage_seal_key(recovery_key, &BASE64.decode(&registry.salt)?)?;
    let secrets = unseal_self_secrets(&seal_key, registry, &executor)?;

    let nonce_bytes = random_bytes(12)?;
    let shared = secrets
        .agreement
        .diffie_hellman(&AgreementPublic::from(owner_key));
    let hkdf = Hkdf::<Sha256>::new(Some(&nonce_bytes), shared.as_bytes());
    let mut envelope_key = [0u8; 32];
    hkdf.expand(b"cortana.fleet.v1/result", &mut envelope_key)?;
    let cipher = ChaCha20Poly1305::new_from_slice(&envelope_key)?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let header = json!({
        "format": FLEET_CONTRACT,
        "token_id": claims.token_id,
        "executor_device": executor,
        "owner_device": token.issuer_device,
        "sender_signing_public": BASE64.encode(secrets.signing.verifying_key().as_bytes()),
        "payload_sha256": fingerprint(payload),
    });
    let header_bytes = serde_json::to_vec(&header)?;
    let ciphertext = cipher
        .encrypt(
            nonce,
            Payload {
                msg: payload,
                aad: &header_bytes,
            },
        )
        .map_err(|_| anyhow::anyhow!("result sealing failed"))?;
    let mut signed = Sha256::new();
    signed.update(&header_bytes);
    signed.update(&nonce_bytes);
    signed.update(&ciphertext);
    let signature = sign_bytes(&secrets.signing, &signed.finalize());

    let envelope = json!({
        "header": header,
        "nonce": BASE64.encode(&nonce_bytes),
        "ciphertext": BASE64.encode(&ciphertext),
        "signature": signature,
    });
    serde_json::to_vec(&envelope).context("result envelope serialization failed")
}

/// Open a result envelope as the owner device.
///
/// Verifies the executor signature against the trust view, requires the
/// executor to be Active, binds the envelope to the expected token id for
/// idempotent delivery, and returns the authenticated payload.
pub fn open_result(
    store: &Store,
    registry: &Registry,
    recovery_key: &str,
    envelope: &[u8],
    expected_token_id: &str,
) -> Result<Vec<u8>> {
    let owner = self_device(store)?;
    let value: Value =
        serde_json::from_slice(envelope).context("result envelope is not valid JSON")?;
    let header = value
        .get("header")
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("result envelope is missing its header"))?;
    if header.get("format").and_then(Value::as_str) != Some(FLEET_CONTRACT) {
        bail!("unrecognized result envelope format");
    }
    if header.get("owner_device").and_then(Value::as_str) != Some(owner.as_str()) {
        bail!("result envelope is addressed to a different device");
    }
    if header.get("token_id").and_then(Value::as_str) != Some(expected_token_id) {
        bail!("result envelope does not match the expected token id");
    }
    let executor = header
        .get("executor_device")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("envelope header is missing the executor"))?
        .to_string();
    let executor_entry = device_entry(registry, &executor)?;
    require_active(registry, &executor)?;
    let header_signing = header
        .get("sender_signing_public")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("envelope header is missing the signing key"))?;
    if header_signing != executor_entry.summary.signing_public {
        bail!("executor signing key does not match the trust view");
    }

    let nonce_bytes = BASE64
        .decode(
            value
                .get("nonce")
                .and_then(Value::as_str)
                .unwrap_or_default(),
        )
        .context("envelope nonce is not valid base64")?;
    let ciphertext = BASE64
        .decode(
            value
                .get("ciphertext")
                .and_then(Value::as_str)
                .unwrap_or_default(),
        )
        .context("envelope ciphertext is not valid base64")?;
    let signature = BASE64
        .decode(
            value
                .get("signature")
                .and_then(Value::as_str)
                .unwrap_or_default(),
        )
        .context("envelope signature is not valid base64")?;

    let mut header_bytes = serde_json::to_vec(&header)?;
    let mut signed = Sha256::new();
    signed.update(&header_bytes);
    signed.update(&nonce_bytes);
    signed.update(&ciphertext);
    let verifying = VerifyingKey::from_bytes(
        &BASE64
            .decode(header_signing)
            .context("executor signing key is not valid base64")?
            .as_slice()
            .try_into()
            .context("executor signing key has the wrong length")?,
    )?;
    verify_signature(&verifying, &signed.finalize(), &BASE64.encode(&signature))?;

    let executor_agreement = BASE64
        .decode(&executor_entry.summary.agreement_public)
        .context("executor agreement key is not valid base64")?;
    let mut executor_key = [0u8; 32];
    executor_key.copy_from_slice(&executor_agreement);

    let seal_key = storage_seal_key(recovery_key, &BASE64.decode(&registry.salt)?)?;
    let secrets = unseal_self_secrets(&seal_key, registry, &owner)?;
    let shared = secrets
        .agreement
        .diffie_hellman(&AgreementPublic::from(executor_key));
    let hkdf = Hkdf::<Sha256>::new(Some(&nonce_bytes), shared.as_bytes());
    let mut envelope_key = [0u8; 32];
    hkdf.expand(b"cortana.fleet.v1/result", &mut envelope_key)?;
    let cipher = ChaCha20Poly1305::new_from_slice(&envelope_key)?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let payload = cipher
        .decrypt(
            nonce,
            Payload {
                msg: ciphertext.as_ref(),
                aad: &header_bytes,
            },
        )
        .map_err(|_| anyhow::anyhow!("result envelope failed to open for this device"))?;
    header_bytes.zeroize();
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::device_identity;
    use crate::store::Store;
    use tempfile::tempdir;

    fn paired_stores() -> (
        tempfile::TempDir,
        tempfile::TempDir,
        Store,
        Store,
        String,
        String,
    ) {
        let guard_a = tempdir().expect("temp a");
        let guard_b = tempdir().expect("temp b");
        let store_a = Store::open(&guard_a.path().join("a.sqlite3")).expect("open a");
        let store_b = Store::open(&guard_b.path().join("b.sqlite3")).expect("open b");
        let initialized = device_identity::initialize(&store_a, "owner", 100).expect("initialize");
        let recovery = initialized.recovery_key.expose().to_string();
        let mut registry = device_identity::load(&store_a)
            .expect("load")
            .expect("registry");
        let enrolled = device_identity::enroll(&store_a, &mut registry, &recovery, "worker", 100)
            .expect("enroll");
        let export =
            device_identity::export_device(&registry, &enrolled.device_id).expect("export");
        device_identity::adopt(&store_b, &export, &recovery, 100).expect("adopt");
        (
            guard_a,
            guard_b,
            store_a,
            store_b,
            enrolled.device_id,
            recovery,
        )
    }

    fn grant_request(audience: &str, ttl_seconds: i64) -> TaskGrantRequest {
        TaskGrantRequest {
            audience: audience.to_string(),
            job_id: "job-42".into(),
            capability: "filesystem.documents".into(),
            workspace: "work".into(),
            source_scope: vec!["repo-alpha".into()],
            credential_reference: Some("vault:repo-alpha-token".into()),
            ttl_seconds,
            max_documents: 500,
            max_bytes: 32 * 1024 * 1024,
        }
    }

    #[test]
    fn grant_roundtrip_verifies_claims_for_the_audience() {
        let (_ga, _gb, store_a, store_b, device_b, recovery) = paired_stores();
        let registry = device_identity::load(&store_a)
            .expect("load")
            .expect("registry");
        let token = issue_task_grant(
            &store_a,
            &registry,
            &recovery,
            &grant_request(&device_b, 3600),
        )
        .expect("issue");
        let worker_registry = device_identity::load(&store_b)
            .expect("load")
            .expect("registry");
        let claims = verify_task_grant(&store_b, &worker_registry, &token, chrono::Utc::now())
            .expect("verify");
        assert_eq!(claims.job_id, "job-42");
        assert_eq!(claims.workspace, "work");
        assert_eq!(claims.source_scope, vec!["repo-alpha".to_string()]);
        assert_eq!(
            claims.credential_reference.as_deref(),
            Some("vault:repo-alpha-token")
        );
        assert_eq!(claims.audience, device_b);
        assert_eq!(claims.max_documents, 500);
    }

    #[test]
    fn expired_grants_and_foreign_audiences_are_rejected() {
        let (_ga, _gb, store_a, store_b, device_b, recovery) = paired_stores();
        let registry = device_identity::load(&store_a)
            .expect("load")
            .expect("registry");
        let token = issue_task_grant(&store_a, &registry, &recovery, &grant_request(&device_b, 0))
            .expect("issue");
        let worker_registry = device_identity::load(&store_b)
            .expect("load")
            .expect("registry");
        let later = chrono::Utc::now() + chrono::Duration::seconds(1);
        assert!(verify_task_grant(&store_b, &worker_registry, &token, later).is_err());

        // The owner device is not the audience.
        assert!(
            verify_task_grant(&store_a, &registry, &token, chrono::Utc::now()).is_err(),
            "grant must be rejected off its audience device"
        );
    }

    #[test]
    fn tampered_claims_fail_signature_verification() {
        let (_ga, _gb, store_a, store_b, device_b, recovery) = paired_stores();
        let registry = device_identity::load(&store_a)
            .expect("load")
            .expect("registry");
        let mut token = issue_task_grant(
            &store_a,
            &registry,
            &recovery,
            &grant_request(&device_b, 3600),
        )
        .expect("issue");
        token.claims["max_documents"] = json!(999_999);
        let worker_registry = device_identity::load(&store_b)
            .expect("load")
            .expect("registry");
        assert!(
            verify_task_grant(&store_b, &worker_registry, &token, chrono::Utc::now()).is_err(),
            "claims edits must break the issuer signature"
        );
    }

    #[test]
    fn revoked_issuer_grants_are_rejected_by_the_worker() {
        let (_ga, _gb, store_a, store_b, device_b, recovery) = paired_stores();
        let registry = device_identity::load(&store_a)
            .expect("load")
            .expect("registry");
        let token = issue_task_grant(
            &store_a,
            &registry,
            &recovery,
            &grant_request(&device_b, 3600),
        )
        .expect("issue");
        let device_a = store_a
            .sync_self_device()
            .expect("self")
            .expect("device id");

        // Revocation reaches the worker through a registry refresh.
        let mut worker_registry = device_identity::load(&store_b)
            .expect("load")
            .expect("registry");
        for entry in &mut worker_registry.devices {
            if entry.summary.device_id == device_a {
                entry.summary.status = DeviceStatus::Revoked {
                    at: chrono::Utc::now().to_rfc3339(),
                };
            }
        }
        device_identity::save(&store_b, &worker_registry).expect("save");
        assert!(
            verify_task_grant(&store_b, &worker_registry, &token, chrono::Utc::now()).is_err(),
            "grants from a revoked issuer must not verify"
        );
    }

    #[test]
    fn result_envelopes_roundtrip_and_bind_to_the_token_id() {
        let (_ga, _gb, store_a, store_b, _device_b, recovery) = paired_stores();
        let registry = device_identity::load(&store_a)
            .expect("load")
            .expect("registry");
        let token = issue_task_grant(
            &store_a,
            &registry,
            &recovery,
            &grant_request(
                store_b
                    .sync_self_device()
                    .expect("self")
                    .expect("id")
                    .as_str(),
                3600,
            ),
        )
        .expect("issue");
        let worker_registry = device_identity::load(&store_b)
            .expect("load")
            .expect("registry");
        let payload = br#"{"observations":[{"source_id":"f1","path":"/data/f1"}]}"#;
        let envelope =
            seal_result(&store_b, &worker_registry, &recovery, &token, payload).expect("seal");

        let owner_registry = device_identity::load(&store_a)
            .expect("load")
            .expect("registry");
        let token_id = token.claims["token_id"].as_str().expect("token id");
        let opened =
            open_result(&store_a, &owner_registry, &recovery, &envelope, token_id).expect("open");
        assert_eq!(opened, payload);

        // Idempotent delivery binding: a different expected token id fails.
        assert!(
            open_result(
                &store_a,
                &owner_registry,
                &recovery,
                &envelope,
                "other-token"
            )
            .is_err()
        );

        // Tampered envelopes fail authentication.
        let mut value: Value = serde_json::from_slice(&envelope).expect("json");
        value["signature"] = Value::String("QUFB".into());
        let tampered = serde_json::to_vec(&value).expect("reserialize");
        assert!(open_result(&store_a, &owner_registry, &recovery, &tampered, token_id).is_err());
    }
}
