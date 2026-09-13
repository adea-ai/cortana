//! Revisioned change journal and encrypted sync-bundle application
//! (`cortana.sync.bundle.v1`).
//!
//! Implements the store half of ADR 0003's encrypted personal multi-device
//! mode: a per-object revision journal with tombstones, per-peer watermarks,
//! deterministic conflict resolution with a user-reviewable conflict queue,
//! and atomic bundle application so a partial transfer can never become a
//! revision authority. Derived state (chunks, embeddings, code indexes) is
//! never synchronized; it is rebuilt locally after a bundle applies.

use anyhow::{Context, Result, bail};
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use rusqlite::{Transaction, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::store::Store;

pub const SYNC_SELF_DEVICE_META: &str = "sync.self_device";
const DOCUMENT_COLUMNS: &[&str] = &[
    "id",
    "source",
    "source_id",
    "title",
    "uri",
    "content_hash",
    "updated_at",
    "project",
    "acl_json",
    "metadata_json",
    "content",
];
const MEMORY_COLUMNS: &[&str] = &[
    "id",
    "kind",
    "content_type",
    "retention_tier",
    "scope",
    "project",
    "title",
    "content",
    "source",
    "source_id",
    "dedupe_key",
    "confidence",
    "importance",
    "status",
    "acl_json",
    "provenance_json",
    "observed_at",
    "valid_from",
    "valid_until",
    "supersedes_id",
    "created_at",
    "updated_at",
];

/// One journal entry with its full payload, as transferred in a bundle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncEntry {
    pub journal_id: i64,
    pub object_kind: String,
    pub object_id: String,
    pub revision: i64,
    pub origin_device: String,
    pub fingerprint: String,
    pub tombstone: bool,
    pub changed_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApplyReport {
    pub applied: usize,
    pub acknowledged: usize,
    pub tombstones_applied: usize,
    pub conflicts_resolved_remote: usize,
    pub conflicts_recorded_local: usize,
    pub entries: usize,
    pub up_to_journal_id: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncConflictRecord {
    pub conflict_id: i64,
    pub object_kind: String,
    pub object_id: String,
    pub local_revision: i64,
    pub remote_revision: i64,
    pub local_origin: String,
    pub remote_origin: String,
    pub resolution: String,
    pub created_at: String,
    pub resolved_at: Option<String>,
}

fn fingerprint_value(parts: &[Value]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"cortana.sync.fingerprint.v1");
    for part in parts {
        hasher.update([0x1f]);
        hasher.update(part.to_string().as_bytes());
    }
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write as _;
        write!(hex, "{byte:02x}").expect("formatting cannot fail");
    }
    format!("sha256:{hex}")
}

fn columns_for_kind(kind: &str) -> Result<(&'static [&'static str], &'static str)> {
    match kind {
        "document" => Ok((DOCUMENT_COLUMNS, "documents")),
        "memory" => Ok((MEMORY_COLUMNS, "memories")),
        other => bail!("unsupported sync object kind {other}"),
    }
}

fn row_fingerprint_in_transaction(
    transaction: &Transaction<'_>,
    kind: &str,
    object_id: &str,
) -> Result<Option<String>> {
    let (columns, table) = columns_for_kind(kind)?;
    let sql = format!("SELECT {} FROM {table} WHERE id = ?1", columns.join(", "));
    let mut statement = transaction.prepare(&sql)?;
    let mut rows = statement.query(params![object_id])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    let mut parts = Vec::with_capacity(columns.len());
    for index in 0..columns.len() {
        parts.push(json_value_from_column(row, index)?);
    }
    Ok(Some(fingerprint_value(&parts)))
}

/// Convert a column value into JSON, mirroring SQLite storage affinity.
fn json_value_from_column(row: &rusqlite::Row<'_>, index: usize) -> Result<Value> {
    use rusqlite::types::ValueRef;
    Ok(match row.get_ref(index)? {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(value) => json!(value),
        ValueRef::Real(value) => json!(value),
        ValueRef::Text(text) => Value::String(String::from_utf8_lossy(text).into_owned()),
        ValueRef::Blob(blob) => json!(BASE64_STANDARD.encode(blob)),
    })
}

/// SQLite value from a JSON payload value for dynamic bundle inserts.
fn column_value(value: &Value) -> rusqlite::types::Value {
    use rusqlite::types::Value as SqliteValue;
    match value {
        Value::Null => SqliteValue::Null,
        Value::Bool(flag) => SqliteValue::Integer(i64::from(*flag)),
        Value::Number(number) => {
            if let Some(int) = number.as_i64() {
                SqliteValue::Integer(int)
            } else {
                SqliteValue::Real(number.as_f64().unwrap_or_default())
            }
        }
        Value::String(text) => SqliteValue::Text(text.clone()),
        other => SqliteValue::Text(other.to_string()),
    }
}

fn apply_payload(transaction: &Transaction<'_>, kind: &str, payload: &Value) -> Result<()> {
    let (columns, table) = columns_for_kind(kind)?;
    let values: Vec<rusqlite::types::Value> = columns
        .iter()
        .map(|column| column_value(payload.get(*column).unwrap_or(&Value::Null)))
        .collect();
    let placeholders = vec!["?"; columns.len()].join(",");
    let updates = columns
        .iter()
        .map(|column| format!("{column}=excluded.{column}"))
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "INSERT INTO {table}({columns}) VALUES({placeholders})
         ON CONFLICT(id) DO UPDATE SET {updates}",
        columns = columns.join(","),
    );
    transaction.execute(&sql, rusqlite::params_from_iter(values.iter()))?;
    let object_id = payload
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if kind == "document" {
        // Derived chunk state is never synchronized; invalidate it so the
        // document re-chunks and re-embeds under local policy on next ingest.
        transaction.execute(
            "DELETE FROM chunks_fts WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id=?1)",
            params![object_id],
        )?;
        transaction.execute(
            "DELETE FROM chunks WHERE document_id=?1",
            params![object_id],
        )?;
    } else if kind == "memory" {
        let title = payload
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let content = payload
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or_default();
        transaction.execute(
            "DELETE FROM memories_fts WHERE memory_id=?1",
            params![object_id],
        )?;
        transaction.execute(
            "INSERT INTO memories_fts(memory_id,title,content) VALUES(?1,?2,?3)",
            params![object_id, title, content],
        )?;
    }
    Ok(())
}

fn self_device_in_transaction(transaction: &Transaction<'_>) -> Option<String> {
    transaction
        .query_row(
            "SELECT value FROM meta WHERE key = ?1",
            params![SYNC_SELF_DEVICE_META],
            |row| row.get::<_, String>(0),
        )
        .ok()
}

/// Journal a canonical object change inside the caller's transaction.
///
/// No-ops when device identity has not been adopted (local-only stores carry
/// zero sync overhead). Deleted rows journal as tombstones. Returns `true`
/// when a new journal entry was written.
pub(crate) fn journal_in_transaction(
    transaction: &Transaction<'_>,
    kind: &str,
    object_id: &str,
) -> Result<bool> {
    let Some(origin_device) = self_device_in_transaction(transaction) else {
        return Ok(false);
    };
    let fingerprint = row_fingerprint_in_transaction(transaction, kind, object_id)?;
    let tombstone = i64::from(fingerprint.is_none());
    let fingerprint = fingerprint.unwrap_or_else(|| "deleted".to_string());
    let latest: Option<(i64, String, i64)> = transaction
        .query_row(
            "SELECT revision, fingerprint, tombstone FROM sync_journal
             WHERE object_kind=?1 AND object_id=?2 ORDER BY revision DESC LIMIT 1",
            params![kind, object_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .ok();
    let (revision, changed_at) = match latest {
        Some((_revision, latest_fingerprint, latest_tombstone))
            if latest_fingerprint == fingerprint && latest_tombstone == tombstone =>
        {
            return Ok(false);
        }
        Some((revision, _, _)) => {
            let next = revision + 1;
            (next, chrono::Utc::now().to_rfc3339())
        }
        None => (1, chrono::Utc::now().to_rfc3339()),
    };
    transaction.execute(
        "INSERT INTO sync_journal(object_kind,object_id,revision,origin_device,fingerprint,tombstone,changed_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![
            kind,
            object_id,
            revision,
            origin_device,
            fingerprint,
            tombstone,
            changed_at
        ],
    )?;
    Ok(true)
}

impl Store {
    /// The device identity this store operates as, when adopted.
    pub fn sync_self_device(&self) -> Result<Option<String>> {
        self.meta_get(SYNC_SELF_DEVICE_META)
    }

    /// Export pending journal entries for a peer with their full payloads.
    ///
    /// Returns entries after the peer's acknowledged watermark plus the
    /// inclusive journal id the peer should acknowledge on full apply.
    pub fn sync_export_entries(
        &self,
        peer_device: &str,
        limit: usize,
    ) -> Result<(Vec<SyncEntry>, i64)> {
        let connection = self
            .sync_write_connection()
            .lock()
            .expect("store lock poisoned");
        let watermark: i64 = connection
            .query_row(
                "SELECT acked_watermark FROM sync_watermarks WHERE peer_device=?1",
                params![peer_device],
                |row| row.get(0),
            )
            .unwrap_or(0);
        let mut statement = connection.prepare(
            "SELECT journal_id, object_kind, object_id, revision, origin_device, fingerprint,
                    tombstone, changed_at
             FROM sync_journal WHERE journal_id > ?1 ORDER BY journal_id LIMIT ?2",
        )?;
        let mut entries = statement
            .query_map(
                params![watermark, i64::try_from(limit).unwrap_or(i64::MAX)],
                |row| {
                    Ok(SyncEntry {
                        journal_id: row.get(0)?,
                        object_kind: row.get(1)?,
                        object_id: row.get(2)?,
                        revision: row.get(3)?,
                        origin_device: row.get(4)?,
                        fingerprint: row.get(5)?,
                        tombstone: row.get::<_, i64>(6)? != 0,
                        changed_at: row.get(7)?,
                        payload: None,
                    })
                },
            )?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        let up_to = entries
            .last()
            .map(|entry| entry.journal_id)
            .unwrap_or(watermark);
        for entry in &mut entries {
            if entry.tombstone {
                continue;
            }
            let (columns, table) = columns_for_kind(&entry.object_kind)?;
            let sql = format!("SELECT {} FROM {table} WHERE id = ?1", columns.join(", "));
            let mut payload_statement = connection.prepare(&sql)?;
            let mut rows = payload_statement.query(params![entry.object_id])?;
            if let Some(row) = rows.next()? {
                let mut payload = serde_json::Map::new();
                for (index, column) in columns.iter().enumerate() {
                    payload.insert((*column).to_string(), json_value_from_column(row, index)?);
                }
                entry.payload = Some(Value::Object(payload));
            }
        }
        Ok((entries, up_to))
    }

    /// Apply a peer's entries atomically and acknowledge their watermark.
    ///
    /// The whole bundle applies in one transaction: a partial transfer never
    /// advances revision state or the peer watermark. Concurrent edits made
    /// locally resolve deterministically by (changed_at, origin_device); the
    /// losing side is always preserved for owner review.
    pub fn sync_import_entries(
        &self,
        peer_device: &str,
        entries: Vec<SyncEntry>,
        up_to: i64,
    ) -> Result<ApplyReport> {
        let mut report = ApplyReport {
            applied: 0,
            acknowledged: 0,
            tombstones_applied: 0,
            conflicts_resolved_remote: 0,
            conflicts_recorded_local: 0,
            entries: entries.len(),
            up_to_journal_id: up_to,
        };
        let mut connection = self
            .sync_write_connection()
            .lock()
            .expect("store lock poisoned");
        let transaction = connection.transaction()?;
        let self_device = self_device_in_transaction(&transaction);
        for entry in entries {
            let local_latest: Option<(i64, String, String, i64, String)> = transaction
                .query_row(
                    "SELECT revision, fingerprint, origin_device, tombstone, changed_at
                     FROM sync_journal WHERE object_kind=?1 AND object_id=?2
                     ORDER BY revision DESC LIMIT 1",
                    params![entry.object_kind, entry.object_id],
                    |row| {
                        Ok((
                            row.get(0)?,
                            row.get(1)?,
                            row.get(2)?,
                            row.get(3)?,
                            row.get(4)?,
                        ))
                    },
                )
                .ok();
            let Some((
                local_revision,
                local_fingerprint,
                local_origin,
                local_tombstone,
                local_changed_at,
            )) = local_latest
            else {
                // Unknown object here: apply unless the entry is a tombstone
                // for something this store never held.
                if entry.tombstone {
                    report.acknowledged += 1;
                    continue;
                }
                let payload = require_payload(&entry)?;
                apply_payload(&transaction, &entry.object_kind, payload)?;
                transaction.execute(
                    "INSERT INTO sync_journal(object_kind,object_id,revision,origin_device,fingerprint,tombstone,changed_at)
                     VALUES(?1,?2,1,?3,?4,0,?5)",
                    params![
                        entry.object_kind,
                        entry.object_id,
                        entry.origin_device,
                        entry.fingerprint,
                        entry.changed_at
                    ],
                )?;
                report.applied += 1;
                continue;
            };
            if local_fingerprint == entry.fingerprint {
                report.acknowledged += 1;
                continue;
            }
            let local_edited_here = Some(&local_origin) == self_device.as_ref();
            if local_edited_here && local_tombstone == 0 {
                // Genuine concurrent edit: deterministic winner is the later
                // changed_at, with ties broken to the larger origin device id.
                let incoming_wins =
                    (&entry.changed_at, &entry.origin_device) > (&local_changed_at, &local_origin);
                record_conflict(
                    &transaction,
                    &entry,
                    local_revision,
                    &local_origin,
                    if incoming_wins {
                        "remote-wins-by-recency"
                    } else {
                        "local-wins-by-recency-remote-preserved"
                    },
                )?;
                if incoming_wins {
                    apply_incoming(&transaction, &entry, local_revision)?;
                    report.conflicts_resolved_remote += 1;
                    report.applied += 1;
                } else {
                    report.conflicts_recorded_local += 1;
                }
                continue;
            }
            // Plain catch-up: the local copy has not diverged.
            if entry.tombstone {
                report.tombstones_applied += 1;
            } else {
                report.applied += 1;
            }
            apply_incoming(&transaction, &entry, local_revision)?;
        }
        transaction.execute(
            "INSERT INTO sync_watermarks(peer_device,imported_watermark,updated_at) VALUES(?1,?2,?3)
             ON CONFLICT(peer_device) DO UPDATE SET imported_watermark=excluded.imported_watermark,
             updated_at=excluded.updated_at",
            params![peer_device, up_to, chrono::Utc::now().to_rfc3339()],
        )?;
        transaction.commit()?;
        Ok(report)
    }

    /// What this store has imported from the peer so far, used as the ack a
    /// bundle back to that peer should carry.
    pub fn sync_imported_watermark(&self, peer_device: &str) -> Result<i64> {
        let connection = self
            .sync_write_connection()
            .lock()
            .expect("store lock poisoned");
        Ok(connection
            .query_row(
                "SELECT imported_watermark FROM sync_watermarks WHERE peer_device=?1",
                params![peer_device],
                |row| row.get(0),
            )
            .unwrap_or(0))
    }

    /// Record a peer's acknowledgement of this store's journal up to a point.
    ///
    /// Only advances: an out-of-order or replayed ack cannot shrink exports.
    pub fn sync_acknowledge_peer(&self, peer_device: &str, ack: i64) -> Result<()> {
        let mut connection = self
            .sync_write_connection()
            .lock()
            .expect("store lock poisoned");
        let transaction = connection.transaction()?;
        transaction.execute(
            "INSERT INTO sync_watermarks(peer_device,acked_watermark,updated_at) VALUES(?1,?2,?3)
             ON CONFLICT(peer_device) DO UPDATE SET
               acked_watermark=MAX(acked_watermark, excluded.acked_watermark),
               updated_at=excluded.updated_at",
            params![peer_device, ack, chrono::Utc::now().to_rfc3339()],
        )?;
        transaction.commit()?;
        Ok(())
    }

    /// Snapshot of journal size, peers, freshness, and open conflicts.
    pub fn sync_status(&self) -> Result<Value> {
        // meta_get takes the same mutex; read it before locking here.
        let self_device = self.meta_get(SYNC_SELF_DEVICE_META)?;
        let connection = self
            .sync_write_connection()
            .lock()
            .expect("store lock poisoned");
        let journal_entries: i64 =
            connection.query_row("SELECT COUNT(*) FROM sync_journal", [], |row| row.get(0))?;
        let open_conflicts: i64 = connection.query_row(
            "SELECT COUNT(*) FROM sync_conflicts WHERE resolved_at IS NULL",
            [],
            |row| row.get(0),
        )?;
        let mut peers_statement = connection.prepare(
            "SELECT peer_device, imported_watermark, acked_watermark, updated_at
             FROM sync_watermarks",
        )?;
        let peers: Vec<Value> = peers_statement
            .query_map([], |row| {
                Ok(json!({
                    "peer_device": row.get::<_, String>(0)?,
                    "imported_watermark": row.get::<_, i64>(1)?,
                    "acked_watermark": row.get::<_, i64>(2)?,
                    "updated_at": row.get::<_, String>(3)?,
                }))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(json!({
            "self_device": self_device,
            "journal_entries": journal_entries,
            "open_conflicts": open_conflicts,
            "peers": peers,
        }))
    }

    /// List conflicts newest-first, including unresolved ones.
    pub fn sync_list_conflicts(&self, limit: usize) -> Result<Vec<SyncConflictRecord>> {
        let connection = self
            .sync_write_connection()
            .lock()
            .expect("store lock poisoned");
        let mut statement = connection.prepare(
            "SELECT conflict_id, object_kind, object_id, local_revision, remote_revision,
                    local_origin, remote_origin, resolution, created_at, resolved_at
             FROM sync_conflicts ORDER BY conflict_id DESC LIMIT ?1",
        )?;
        let conflicts = statement
            .query_map(params![i64::try_from(limit).unwrap_or(i64::MAX)], |row| {
                Ok(SyncConflictRecord {
                    conflict_id: row.get(0)?,
                    object_kind: row.get(1)?,
                    object_id: row.get(2)?,
                    local_revision: row.get(3)?,
                    remote_revision: row.get(4)?,
                    local_origin: row.get(5)?,
                    remote_origin: row.get(6)?,
                    resolution: row.get(7)?,
                    created_at: row.get(8)?,
                    resolved_at: row.get(9)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(conflicts)
    }

    /// Resolve a conflict: accept the preserved remote payload or keep local.
    pub fn sync_resolve_conflict(&self, conflict_id: i64, accept_remote: bool) -> Result<()> {
        let mut connection = self
            .sync_write_connection()
            .lock()
            .expect("store lock poisoned");
        let transaction = connection.transaction()?;
        let (kind, object_id, payload_json): (String, String, Option<String>) = transaction
            .query_row(
                "SELECT object_kind, object_id, payload_json FROM sync_conflicts
                 WHERE conflict_id=?1 AND resolved_at IS NULL",
                params![conflict_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .context("unknown or already-resolved conflict")?;
        if accept_remote {
            let Some(payload_json) = payload_json else {
                bail!("conflict {conflict_id} has no preserved remote payload");
            };
            let payload: Value = serde_json::from_str(&payload_json)?;
            apply_payload(&transaction, &kind, &payload)?;
            journal_in_transaction(&transaction, &kind, &object_id)?;
        }
        transaction.execute(
            "UPDATE sync_conflicts SET resolved_at=?2 WHERE conflict_id=?1",
            params![conflict_id, chrono::Utc::now().to_rfc3339()],
        )?;
        transaction.commit()?;
        Ok(())
    }
}

/// Apply one incoming entry's full effect — payload upsert or tombstone —
/// and journal the resulting local revision.
fn apply_incoming(
    transaction: &Transaction<'_>,
    entry: &SyncEntry,
    local_revision: i64,
) -> Result<()> {
    if entry.tombstone {
        transaction.execute(
            "DELETE FROM chunks_fts WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id=?1)",
            params![entry.object_id],
        )?;
        transaction.execute(
            "DELETE FROM chunks WHERE document_id=?1",
            params![entry.object_id],
        )?;
        transaction.execute(
            "DELETE FROM memories_fts WHERE memory_id=?1",
            params![entry.object_id],
        )?;
        transaction.execute(
            "DELETE FROM documents WHERE id=?1",
            params![entry.object_id],
        )?;
        transaction.execute("DELETE FROM memories WHERE id=?1", params![entry.object_id])?;
        transaction.execute(
            "INSERT INTO sync_journal(object_kind,object_id,revision,origin_device,fingerprint,tombstone,changed_at)
             VALUES(?1,?2,?3,?4,'deleted',1,?5)",
            params![
                entry.object_kind,
                entry.object_id,
                local_revision + 1,
                entry.origin_device,
                entry.changed_at
            ],
        )?;
        return Ok(());
    }
    let payload = require_payload(entry)?;
    apply_payload(transaction, &entry.object_kind, payload)?;
    transaction.execute(
        "INSERT INTO sync_journal(object_kind,object_id,revision,origin_device,fingerprint,tombstone,changed_at)
         VALUES(?1,?2,?3,?4,?5,0,?6)",
        params![
            entry.object_kind,
            entry.object_id,
            local_revision + 1,
            entry.origin_device,
            entry.fingerprint,
            entry.changed_at
        ],
    )?;
    Ok(())
}

fn require_payload(entry: &SyncEntry) -> Result<&Value> {
    entry.payload.as_ref().ok_or_else(|| {
        anyhow::anyhow!(
            "bundle entry {}:{} is missing its payload",
            entry.object_kind,
            entry.object_id
        )
    })
}

#[allow(clippy::too_many_arguments)]
fn record_conflict(
    transaction: &Transaction<'_>,
    entry: &SyncEntry,
    local_revision: i64,
    local_origin: &str,
    resolution: &str,
) -> Result<()> {
    transaction.execute(
        "INSERT INTO sync_conflicts(object_kind,object_id,local_revision,remote_revision,
           local_origin,remote_origin,resolution,payload_json,created_at)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![
            entry.object_kind,
            entry.object_id,
            local_revision,
            entry.revision,
            local_origin,
            entry.origin_device,
            resolution,
            entry.payload.as_ref().map(|payload| payload.to_string()),
            chrono::Utc::now().to_rfc3339()
        ],
    )?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::device_identity;
    use crate::memory::MemoryInput;
    use crate::model::Document;
    use crate::store::Store;
    use chrono::Utc;
    use rusqlite::OptionalExtension;
    use tempfile::tempdir;

    fn document(source_id: &str, content: &str) -> Document {
        Document {
            source: "test".into(),
            source_id: source_id.into(),
            title: source_id.into(),
            content: content.into(),
            uri: None,
            updated_at: Utc::now(),
            project: "demo".into(),
            acl: Vec::new(),
            metadata: serde_json::json!({}),
        }
    }

    fn memory_input(title: &str, content: &str) -> MemoryInput {
        MemoryInput {
            kind: "semantic".into(),
            project: "demo".into(),
            title: title.into(),
            content: content.into(),
            source: "test".into(),
            source_id: String::new(),
            dedupe_key: None,
            confidence: 0.9,
            importance: 0.8,
            acl: Vec::new(),
            provenance: serde_json::json!({}),
            supersedes_id: None,
            valid_until: None,
        }
    }

    struct PeerStores {
        _guard_a: tempfile::TempDir,
        _guard_b: tempfile::TempDir,
        store_a: Store,
        store_b: Store,
        device_a: String,
        device_b: String,
        recovery: String,
    }

    /// Two paired stores: A holds the account root, B adopts an exported
    /// credential for its enrolled device.
    fn paired_stores() -> PeerStores {
        let guard_a = tempdir().expect("temp a");
        let guard_b = tempdir().expect("temp b");
        let store_a = Store::open(&guard_a.path().join("a.sqlite3")).expect("open a");
        let store_b = Store::open(&guard_b.path().join("b.sqlite3")).expect("open b");
        let initialized = device_identity::initialize(&store_a, "laptop", 100).expect("initialize");
        let recovery = initialized.recovery_key.expose().to_string();
        let device_a = initialized.local_device.device_id.clone();
        let mut registry = device_identity::load(&store_a)
            .expect("load")
            .expect("registry");
        let enrolled = device_identity::enroll(&store_a, &mut registry, &recovery, "desktop", 100)
            .expect("enroll");
        let device_b = enrolled.device_id.clone();
        let export = device_identity::export_device(&registry, &device_b).expect("export");
        device_identity::adopt(&store_b, &export, &recovery, 100).expect("adopt");
        PeerStores {
            _guard_a: guard_a,
            _guard_b: guard_b,
            store_a,
            store_b,
            device_a,
            device_b,
            recovery,
        }
    }

    /// Export A -> sealed bundle for B, open and apply on B.
    fn exchange(
        sender: &Store,
        target_device: &str,
        recovery: &str,
        target: &Store,
    ) -> ApplyReport {
        let registry = device_identity::load(sender)
            .expect("load")
            .expect("registry");
        let (entries, up_to) = sender
            .sync_export_entries(target_device, 500)
            .expect("export");
        let payload = serde_json::json!({
            "entries": entries,
            "up_to_journal_id": up_to,
        });
        let bundle = device_identity::seal_sync_bundle(
            sender,
            &registry,
            recovery,
            target_device,
            payload.to_string().as_bytes(),
        )
        .expect("seal bundle");
        let target_registry = device_identity::load(target)
            .expect("load")
            .expect("registry");
        let (header, payload_bytes) =
            device_identity::open_sync_bundle(target, &target_registry, recovery, &bundle)
                .expect("open bundle");
        let sender_device = header
            .get("sender_device")
            .and_then(Value::as_str)
            .expect("sender")
            .to_string();
        let payload: Value = serde_json::from_slice(&payload_bytes).expect("payload json");
        let entries: Vec<SyncEntry> =
            serde_json::from_value(payload.get("entries").cloned().expect("entries"))
                .expect("entries");
        let up_to = payload
            .get("up_to_journal_id")
            .and_then(Value::as_i64)
            .expect("watermark");
        let report = target
            .sync_import_entries(&sender_device, entries, up_to)
            .expect("apply");
        if let Some(ack) = header.get("ack_for_peer").and_then(Value::as_i64) {
            target
                .sync_acknowledge_peer(&sender_device, ack)
                .expect("ack");
        }
        report
    }

    fn document_content(store: &Store, source_id: &str) -> Option<String> {
        let connection = store.sync_write_connection().lock().expect("lock");
        let id = crate::store::stable_id("test", source_id);
        connection
            .query_row(
                "SELECT content FROM documents WHERE id=?1",
                params![id],
                |row| row.get(0),
            )
            .optional()
            .expect("query")
    }

    fn journal_count(store: &Store) -> i64 {
        store
            .sync_status()
            .expect("status")
            .get("journal_entries")
            .and_then(Value::as_i64)
            .expect("journal_entries")
    }

    #[test]
    fn local_only_store_never_journals() {
        let directory = tempdir().expect("temp");
        let store = Store::open(&directory.path().join("s.sqlite3")).expect("open");
        assert!(
            store
                .upsert(&document("plain", "plain content"), &[])
                .expect("upsert")
        );
        assert_eq!(journal_count(&store), 0);
        assert!(store.sync_self_device().expect("self").is_none());
        let (entries, up_to) = store.sync_export_entries("any-peer", 10).expect("export");
        assert!(entries.is_empty());
        assert_eq!(up_to, 0);
    }

    #[test]
    fn paired_stores_exchange_documents_and_memories_bidirectionally() {
        let peers = paired_stores();
        let device_a = peers.device_a.clone();
        let device_b = peers.device_b.clone();
        let PeerStores {
            store_a,
            store_b,
            recovery,
            ..
        } = peers;
        assert!(
            store_a
                .upsert(&document("doc-1", "shared evidence content"), &[])
                .expect("upsert")
        );
        let report = exchange(&store_a, &device_b, &recovery, &store_b);
        assert_eq!(report.applied, 1);
        assert_eq!(
            document_content(&store_b, "doc-1").as_deref(),
            Some("shared evidence content")
        );

        // Reverse direction: a memory created on B flows back to A.
        store_b
            .remember(&memory_input("fact-1", "remembered fact"))
            .expect("remember on B");
        let report = exchange(&store_b, &device_a, &recovery, &store_a);
        assert_eq!(report.applied, 1);
        let connection = store_a.sync_write_connection().lock().expect("lock");
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM memories WHERE title='fact-1'",
                [],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(count, 1);
    }

    #[test]
    fn repeat_exchange_is_idempotent() {
        let peers = paired_stores();
        let device_a = peers.device_a.clone();
        let device_b = peers.device_b.clone();
        let PeerStores {
            store_a,
            store_b,
            recovery,
            ..
        } = peers;
        assert!(
            store_a
                .upsert(&document("doc-1", "content"), &[])
                .expect("upsert")
        );
        let first = exchange(&store_a, &device_b, &recovery, &store_b);
        assert_eq!(first.applied, 1);
        // The ack for A's journal rides the next bundle from B back to A.
        let back = exchange(&store_b, &device_a, &recovery, &store_a);
        assert_eq!(back.entries, 1, "B's own journal state travels to A");
        let second = exchange(&store_a, &device_b, &recovery, &store_b);
        assert_eq!(second.applied, 0);
        assert_eq!(second.acknowledged, 0);
        assert_eq!(
            second.entries, 0,
            "watermark must suppress already-acked entries"
        );
    }

    #[test]
    fn concurrent_edits_resolve_deterministically_and_preserve_the_loser() {
        let peers = paired_stores();
        let device_a = peers.device_a.clone();
        let device_b = peers.device_b.clone();
        let PeerStores {
            store_a,
            store_b,
            recovery,
            ..
        } = peers;
        assert!(
            store_a
                .upsert(&document("doc-1", "base content"), &[])
                .expect("upsert")
        );
        exchange(&store_a, &device_b, &recovery, &store_b);
        assert_eq!(
            document_content(&store_b, "doc-1").as_deref(),
            Some("base content")
        );

        // Both devices edit concurrently; B edits strictly later.
        assert!(
            store_a
                .upsert(&document("doc-1", "edit from A"), &[])
                .expect("upsert")
        );
        std::thread::sleep(std::time::Duration::from_millis(50));
        assert!(
            store_b
                .upsert(&document("doc-1", "edit from B"), &[])
                .expect("upsert")
        );

        // A imports B's edit: B is later, so remote wins on A.
        let report_a = exchange(&store_b, &device_a, &recovery, &store_a);
        assert_eq!(report_a.conflicts_resolved_remote, 1);
        assert_eq!(
            document_content(&store_a, "doc-1").as_deref(),
            Some("edit from B")
        );

        // B imports A's edit: B is still later, so local wins and A's payload
        // is preserved for review.
        let report_b = exchange(&store_a, &device_b, &recovery, &store_b);
        assert_eq!(report_b.conflicts_recorded_local, 1);
        assert_eq!(
            document_content(&store_b, "doc-1").as_deref(),
            Some("edit from B")
        );

        // Both stores converge on B's content, with the conflict reviewable.
        assert_eq!(
            document_content(&store_a, "doc-1"),
            document_content(&store_b, "doc-1")
        );
        let conflicts = store_b.sync_list_conflicts(10).expect("conflicts");
        assert_eq!(conflicts.len(), 1);
        assert_eq!(
            conflicts[0].resolution,
            "local-wins-by-recency-remote-preserved"
        );
        assert!(conflicts[0].resolved_at.is_none());

        // Owner review can accept the preserved remote payload explicitly.
        store_b
            .sync_resolve_conflict(conflicts[0].conflict_id, true)
            .expect("resolve");
        assert!(
            store_b.sync_list_conflicts(10).expect("conflicts")[0]
                .resolved_at
                .is_some()
        );
    }

    #[test]
    fn tombstones_propagate_and_delete_canonical_rows() {
        let peers = paired_stores();
        let device_b = peers.device_b.clone();
        let PeerStores {
            store_a,
            store_b,
            recovery,
            ..
        } = peers;
        assert!(
            store_a
                .upsert(&document("doc-1", "to be deleted"), &[])
                .expect("upsert")
        );
        assert!(
            store_a
                .upsert(&document("doc-keep", "stays"), &[])
                .expect("upsert")
        );
        exchange(&store_a, &device_b, &recovery, &store_b);
        assert!(document_content(&store_b, "doc-1").is_some());

        // Reconciliation sees only doc-keep, so doc-1 is deleted as stale.
        store_a
            .reconcile("test", "demo", &["doc-keep".to_string()])
            .expect("reconcile");
        let report = exchange(&store_a, &device_b, &recovery, &store_b);
        assert_eq!(report.tombstones_applied, 1);
        assert!(document_content(&store_b, "doc-1").is_none());
        assert!(document_content(&store_b, "doc-keep").is_some());
    }

    #[test]
    fn tampered_bundle_is_rejected() {
        let peers = paired_stores();
        let PeerStores {
            store_a,
            store_b,
            recovery,
            ..
        } = peers;
        assert!(
            store_a
                .upsert(&document("doc-1", "content"), &[])
                .expect("upsert")
        );
        let registry = device_identity::load(&store_a)
            .expect("load")
            .expect("registry");
        let (entries, up_to) = store_a
            .sync_export_entries(&peers.device_b, 500)
            .expect("export");
        let payload = serde_json::json!({ "entries": entries, "up_to_journal_id": up_to });
        let bundle_bytes = device_identity::seal_sync_bundle(
            &store_a,
            &registry,
            &recovery,
            &peers.device_b,
            payload.to_string().as_bytes(),
        )
        .expect("seal");
        let mut value: Value = serde_json::from_slice(&bundle_bytes).expect("json");
        value
            .as_object_mut()
            .expect("object")
            .insert("signature".into(), Value::String("QUFB".into()));
        let tampered = serde_json::to_vec(&value).expect("reserialize");
        let target_registry = device_identity::load(&store_b)
            .expect("load")
            .expect("registry");
        assert!(
            device_identity::open_sync_bundle(&store_b, &target_registry, &recovery, &tampered)
                .is_err(),
            "tampered bundle must not open"
        );
    }

    #[test]
    fn bundle_for_another_device_is_rejected() {
        let peers = paired_stores();
        let PeerStores {
            store_a, recovery, ..
        } = peers;
        assert!(
            store_a
                .upsert(&document("doc-1", "content"), &[])
                .expect("upsert")
        );
        let registry = device_identity::load(&store_a)
            .expect("load")
            .expect("registry");
        let (entries, up_to) = store_a
            .sync_export_entries(&peers.device_b, 500)
            .expect("export");
        let payload = serde_json::json!({ "entries": entries, "up_to_journal_id": up_to });
        let bundle_bytes = device_identity::seal_sync_bundle(
            &store_a,
            &registry,
            &recovery,
            &peers.device_b,
            payload.to_string().as_bytes(),
        )
        .expect("seal");
        // Opening B's bundle on A (the sender) must fail: A is not the target.
        assert!(
            device_identity::open_sync_bundle(&store_a, &registry, &recovery, &bundle_bytes)
                .is_err(),
            "bundle must stay sealed to its target device"
        );
    }

    #[test]
    fn partial_bundle_application_is_atomic() {
        let peers = paired_stores();
        let device_b = peers.device_b.clone();
        let PeerStores {
            store_a,
            store_b,
            recovery,
            ..
        } = peers;
        assert!(
            store_a
                .upsert(&document("doc-1", "first"), &[])
                .expect("upsert")
        );
        assert!(
            store_a
                .upsert(&document("doc-2", "second"), &[])
                .expect("upsert")
        );
        let registry = device_identity::load(&store_a)
            .expect("load")
            .expect("registry");
        let (mut entries, up_to) = store_a.sync_export_entries(&device_b, 500).expect("export");
        // Corrupt the second entry: payload stripped so application bails.
        entries[1].payload = None;
        let payload = serde_json::json!({ "entries": entries, "up_to_journal_id": up_to });
        let bundle = device_identity::seal_sync_bundle(
            &store_a,
            &registry,
            &recovery,
            &device_b,
            payload.to_string().as_bytes(),
        )
        .expect("seal");
        let target_registry = device_identity::load(&store_b)
            .expect("load")
            .expect("registry");
        let (header, payload_bytes) =
            device_identity::open_sync_bundle(&store_b, &target_registry, &recovery, &bundle)
                .expect("open");
        let sender = header
            .get("sender_device")
            .and_then(Value::as_str)
            .expect("sender")
            .to_string();
        let payload: Value = serde_json::from_slice(&payload_bytes).expect("payload");
        let entries: Vec<SyncEntry> =
            serde_json::from_value(payload.get("entries").cloned().expect("entries"))
                .expect("entries");
        let up_to = payload
            .get("up_to_journal_id")
            .and_then(Value::as_i64)
            .expect("wm");
        assert!(
            store_b
                .sync_import_entries(&sender, entries, up_to)
                .is_err()
        );
        // Nothing applied, nothing acknowledged: a partial transfer never
        // becomes a revision authority.
        assert!(document_content(&store_b, "doc-1").is_none());
        assert!(document_content(&store_b, "doc-2").is_none());
        assert_eq!(journal_count(&store_b), 0);
        let status = store_b.sync_status().expect("status");
        assert_eq!(
            status.get("peers").and_then(Value::as_array).map(Vec::len),
            Some(0)
        );
    }
}
