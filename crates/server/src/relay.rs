//! Local-only synchronization relay (`cortana.relay.v1`).
//!
//! Implements ADR 0008: a loopback-by-default HTTP service a Self-hosted owner
//! runs on their own node so their devices can exchange encrypted sync
//! bundles across networks. The relay stores exclusively opaque ciphertext
//! and minimal routing metadata in its own bounded store; it cannot read,
//! decrypt, or verify anything it carries. Clients authenticate with an
//! optional bearer token (mandatory when bound beyond loopback), fetch by
//! recipient, and acknowledge by deletion.

use anyhow::{Context, Result, bail};
use axum::extract::Path as AxumPath;
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, State},
    http::{StatusCode, header},
    response::IntoResponse,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::Path;
use std::sync::Mutex;

pub const RELAY_CONTRACT: &str = "cortana.relay.v1";
const DB_FILE: &str = "relay.sqlite3";
/// Per-recipient mailbox bound: oldest acknowledged-or-swept, newest kept.
const MAILBOX_BUNDLE_LIMIT: usize = 64;
const BUNDLE_BYTE_LIMIT: usize = 8 * 1024 * 1024;
/// Bundles older than this are swept on access; the operator owns the disk.
const RETENTION_DAYS: i64 = 14;

struct RelayState {
    connection: Mutex<rusqlite::Connection>,
    token: Option<String>,
}

pub struct RelayServer {
    state: std::sync::Arc<RelayState>,
}

fn open_database(data_dir: &std::path::Path) -> Result<rusqlite::Connection> {
    std::fs::create_dir_all(data_dir)?;
    let connection = rusqlite::Connection::open(data_dir.join(DB_FILE))?;
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    connection.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS relay_bundles(
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           recipient TEXT NOT NULL,
           bytes INTEGER NOT NULL,
           ciphertext BLOB NOT NULL,
           created_at TEXT NOT NULL);
         CREATE INDEX IF NOT EXISTS idx_relay_bundles_recipient
           ON relay_bundles(recipient, id);",
    )?;
    Ok(connection)
}

impl RelayServer {
    pub fn open(data_dir: &Path, token: Option<String>) -> Result<Self> {
        Ok(Self {
            state: std::sync::Arc::new(RelayState {
                connection: Mutex::new(open_database(data_dir)?),
                token,
            }),
        })
    }

    /// The axum application; mount with `serve` on the operator's bind address.
    pub fn router(&self) -> Router {
        Router::new()
            .route("/v1/relay/healthz", get(healthz))
            .route(
                "/v1/relay/bundles/{recipient}",
                post(upload_bundle).get(list_bundles),
            )
            .route(
                "/v1/relay/bundles/{recipient}/{id}",
                get(fetch_bundle).delete(delete_bundle),
            )
            .layer(DefaultBodyLimit::max(BUNDLE_BYTE_LIMIT))
            .with_state(self.state.clone())
    }

    /// Bind and serve; this is the process main loop for `cortana relay serve`.
    pub async fn serve(&self, listener: tokio::net::TcpListener) -> Result<()> {
        axum::serve(listener, self.router())
            .await
            .context("relay serve failed")
    }
}

fn authorize(state: &RelayState, headers: &axum::http::HeaderMap) -> Result<(), StatusCode> {
    let Some(expected) = &state.token else {
        return Ok(());
    };
    let provided = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    match provided {
        Some(token) if constant_time_eq(token.as_bytes(), expected.as_bytes()) => Ok(()),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in left.iter().zip(right.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

fn sweep_expired(connection: &rusqlite::Connection) -> Result<()> {
    connection.execute(
        "DELETE FROM relay_bundles WHERE created_at < datetime('now', ?1)",
        params![format!("-{RETENTION_DAYS} days")],
    )?;
    Ok(())
}

use rusqlite::params;

/// Enforce the per-recipient mailbox bound by dropping the oldest bundles.
fn enforce_mailbox_bound(connection: &rusqlite::Connection, recipient: &str) -> Result<usize> {
    let count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM relay_bundles WHERE recipient = ?1",
        params![recipient],
        |row| row.get(0),
    )?;
    if count < MAILBOX_BUNDLE_LIMIT as i64 {
        return Ok(0);
    }
    let excess = count - MAILBOX_BUNDLE_LIMIT as i64 + 1;
    let removed = connection.execute(
        "DELETE FROM relay_bundles WHERE id IN (
           SELECT id FROM relay_bundles WHERE recipient = ?1 ORDER BY id LIMIT ?2
         )",
        params![recipient, excess],
    )?;
    Ok(removed)
}

async fn healthz() -> impl IntoResponse {
    Json(json!({ "contract_version": RELAY_CONTRACT, "status": "ok" }))
}

#[derive(Debug, Deserialize)]
struct UploadQuery {
    sender: Option<String>,
}

async fn upload_bundle(
    State(state): State<std::sync::Arc<RelayState>>,
    AxumPath(recipient): AxumPath<String>,
    axum::extract::Query(query): axum::extract::Query<UploadQuery>,
    headers: axum::http::HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<serde_json::Value>, StatusCode> {
    authorize(&state, &headers)?;
    if recipient.trim().is_empty() || recipient.len() > 128 {
        return Err(StatusCode::BAD_REQUEST);
    }
    if body.is_empty() || body.len() > BUNDLE_BYTE_LIMIT {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }
    let connection = state.connection.lock().expect("relay lock poisoned");
    sweep_expired(&connection).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    enforce_mailbox_bound(&connection, &recipient)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    connection
        .execute(
            "INSERT INTO relay_bundles(recipient, bytes, ciphertext, created_at)
             VALUES(?1, ?2, ?3, ?4)",
            rusqlite::params![
                recipient,
                body.len() as i64,
                body.as_ref(),
                chrono::Utc::now().to_rfc3339()
            ],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let id = connection.last_insert_rowid();
    Ok(Json(json!({
        "contract_version": RELAY_CONTRACT,
        "id": id,
        "recipient": recipient,
        "bytes": body.len(),
        "sender": query.sender,
    })))
}

async fn list_bundles(
    State(state): State<std::sync::Arc<RelayState>>,
    AxumPath(recipient): AxumPath<String>,
    headers: axum::http::HeaderMap,
) -> Result<Json<serde_json::Value>, StatusCode> {
    authorize(&state, &headers)?;
    let connection = state.connection.lock().expect("relay lock poisoned");
    sweep_expired(&connection).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut statement = connection
        .prepare(
            "SELECT id, bytes, created_at FROM relay_bundles
             WHERE recipient = ?1 ORDER BY id",
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let bundles = statement
        .query_map(rusqlite::params![recipient], |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "bytes": row.get::<_, i64>(1)?,
                "created_at": row.get::<_, String>(2)?,
            }))
        })
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(
        json!({ "contract_version": RELAY_CONTRACT, "bundles": bundles }),
    ))
}

async fn fetch_bundle(
    State(state): State<std::sync::Arc<RelayState>>,
    AxumPath((recipient, id)): AxumPath<(String, i64)>,
    headers: axum::http::HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    authorize(&state, &headers)?;
    let connection = state.connection.lock().expect("relay lock poisoned");
    let result: Result<Vec<u8>, rusqlite::Error> = connection.query_row(
        "SELECT ciphertext FROM relay_bundles WHERE recipient = ?1 AND id = ?2",
        rusqlite::params![recipient, id],
        |row| row.get(0),
    );
    match result {
        Ok(ciphertext) => Ok((
            [(header::CONTENT_TYPE, "application/octet-stream")],
            ciphertext,
        )),
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(StatusCode::NOT_FOUND),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn delete_bundle(
    State(state): State<std::sync::Arc<RelayState>>,
    AxumPath((recipient, id)): AxumPath<(String, i64)>,
    headers: axum::http::HeaderMap,
) -> Result<Json<serde_json::Value>, StatusCode> {
    authorize(&state, &headers)?;
    let connection = state.connection.lock().expect("relay lock poisoned");
    let removed = connection
        .execute(
            "DELETE FROM relay_bundles WHERE recipient = ?1 AND id = ?2",
            rusqlite::params![recipient, id],
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if removed == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(Json(json!({ "deleted": id })))
}

#[derive(Debug, Clone, Serialize)]
pub struct RemoteBundle {
    pub id: i64,
    pub bytes: usize,
}

/// Push one sealed bundle to a relay mailbox (client side).
pub async fn push_bundle(
    relay_url: &str,
    recipient: &str,
    token: Option<&str>,
    payload: &[u8],
) -> Result<i64> {
    let client = reqwest::Client::new();
    let mut request = client
        .post(format!(
            "{}/v1/relay/bundles/{}",
            relay_url.trim_end_matches('/'),
            recipient
        ))
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .body(payload.to_vec());
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    let response = request.send().await.context("relay push failed")?;
    let status = response.status();
    let body: serde_json::Value = response.json().await.context("relay push body")?;
    if !status.is_success() {
        bail!("relay push rejected ({status}): {body}");
    }
    body.get("id")
        .and_then(serde_json::Value::as_i64)
        .context("relay push response is missing the bundle id")
}

/// List bundles waiting in a relay mailbox (client side).
pub async fn list_remote_bundles(
    relay_url: &str,
    recipient: &str,
    token: Option<&str>,
) -> Result<Vec<RemoteBundle>> {
    let client = reqwest::Client::new();
    let mut request = client.get(format!(
        "{}/v1/relay/bundles/{}",
        relay_url.trim_end_matches('/'),
        recipient
    ));
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    let response = request.send().await.context("relay list failed")?;
    let status = response.status();
    let body: serde_json::Value = response.json().await.context("relay list body")?;
    if !status.is_success() {
        bail!("relay list rejected ({status}): {body}");
    }
    let mut bundles = Vec::new();
    for bundle in body
        .get("bundles")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        bundles.push(RemoteBundle {
            id: bundle
                .get("id")
                .and_then(serde_json::Value::as_i64)
                .context("bundle id missing")?,
            bytes: bundle
                .get("bytes")
                .and_then(serde_json::Value::as_i64)
                .unwrap_or(0) as usize,
        });
    }
    Ok(bundles)
}

/// Fetch one bundle's ciphertext from a relay mailbox (client side).
pub async fn fetch_remote_bundle(
    relay_url: &str,
    recipient: &str,
    id: i64,
    token: Option<&str>,
) -> Result<Vec<u8>> {
    let client = reqwest::Client::new();
    let mut request = client.get(format!(
        "{}/v1/relay/bundles/{}/{}",
        relay_url.trim_end_matches('/'),
        recipient,
        id
    ));
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    let response = request.send().await.context("relay fetch failed")?;
    let status = response.status();
    if !status.is_success() {
        bail!("relay fetch rejected ({status})");
    }
    Ok(response.bytes().await?.to_vec())
}

/// Acknowledge (delete) a fetched bundle so the mailbox stays bounded.
pub async fn delete_remote_bundle(
    relay_url: &str,
    recipient: &str,
    id: i64,
    token: Option<&str>,
) -> Result<()> {
    let client = reqwest::Client::new();
    let mut request = client.delete(format!(
        "{}/v1/relay/bundles/{}/{}",
        relay_url.trim_end_matches('/'),
        recipient,
        id
    ));
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    let response = request.send().await.context("relay delete failed")?;
    if !response.status().is_success() {
        bail!("relay delete rejected ({})", response.status());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{Body, to_bytes};
    use tempfile::tempdir;
    use tower::ServiceExt;

    fn test_relay(token: Option<&str>) -> (tempfile::TempDir, Router) {
        let directory = tempdir().expect("temp dir");
        let server =
            RelayServer::open(directory.path(), token.map(str::to_string)).expect("relay open");
        (directory, server.router())
    }

    async fn upload(app: Router, recipient: &str, payload: &[u8]) -> axum::response::Response {
        app.oneshot(
            axum::http::Request::builder()
                .method("POST")
                .uri(format!("/v1/relay/bundles/{recipient}"))
                .header(header::CONTENT_TYPE, "application/octet-stream")
                .body(Body::from(payload.to_vec()))
                .expect("request"),
        )
        .await
        .expect("response")
    }

    #[tokio::test]
    async fn relay_roundtrip_stores_and_returns_opaque_ciphertext() {
        let (_guard, app) = test_relay(None);
        let payload = b"totally-opaque-ciphertext-not-inspectable";
        let response = upload(app.clone(), "device-b", payload).await;
        assert_eq!(response.status(), StatusCode::OK);

        let list = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method("GET")
                    .uri("/v1/relay/bundles/device-b")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("list");
        let body = to_bytes(list.into_body(), 16 * 1024 * 1024)
            .await
            .expect("body")
            .to_vec();
        let value: serde_json::Value = serde_json::from_slice(&body).expect("json");
        assert_eq!(value["bundles"].as_array().expect("bundles").len(), 1);
        let id = value["bundles"][0]["id"].as_i64().expect("id");

        let fetch = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method("GET")
                    .uri(format!("/v1/relay/bundles/device-b/{id}"))
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("fetch");
        assert_eq!(fetch.status(), StatusCode::OK);
        let bytes = to_bytes(fetch.into_body(), 16 * 1024 * 1024)
            .await
            .expect("bytes")
            .to_vec();
        assert_eq!(bytes, payload);

        let deleted = app
            .oneshot(
                axum::http::Request::builder()
                    .method("DELETE")
                    .uri(format!("/v1/relay/bundles/device-b/{id}"))
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("delete");
        assert_eq!(deleted.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn mailboxes_are_isolated_by_recipient() {
        let (_guard, app) = test_relay(None);
        let _ = upload(app.clone(), "device-b", b"for-b").await;
        let list = app
            .oneshot(
                axum::http::Request::builder()
                    .method("GET")
                    .uri("/v1/relay/bundles/device-c")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("list");
        let body = to_bytes(list.into_body(), 16 * 1024 * 1024)
            .await
            .expect("body")
            .to_vec();
        let value: serde_json::Value = serde_json::from_slice(&body).expect("json");
        assert_eq!(value["bundles"].as_array().expect("bundles").len(), 0);
    }

    #[tokio::test]
    async fn oversize_bundles_are_rejected() {
        let (_guard, app) = test_relay(None);
        let payload = vec![0u8; BUNDLE_BYTE_LIMIT + 1];
        let response = upload(app, "device-b", &payload).await;
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    }

    #[tokio::test]
    async fn token_is_enforced_when_configured() {
        let (_guard, app) = test_relay(Some("relay-secret"));
        let unauthorized = upload(app.clone(), "device-b", b"payload").await;
        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);
        let wrong = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri("/v1/relay/bundles/device-b")
                    .header(header::AUTHORIZATION, "Bearer nope")
                    .body(Body::from("payload"))
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(wrong.status(), StatusCode::UNAUTHORIZED);
        let authorized = app
            .oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri("/v1/relay/bundles/device-b")
                    .header(header::AUTHORIZATION, "Bearer relay-secret")
                    .body(Body::from("payload"))
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(authorized.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn expired_bundles_are_swept() {
        let directory = tempdir().expect("temp dir");
        let server = RelayServer::open(directory.path(), None).expect("open");
        let app = server.router();
        let _ = upload(app.clone(), "device-b", b"stale").await;

        // Backdate the only bundle beyond retention, then list (which sweeps).
        {
            let connection = server.state.connection.lock().expect("lock");
            connection
                .execute(
                    "UPDATE relay_bundles SET created_at = datetime('now', '-20 days')",
                    [],
                )
                .expect("backdate");
        }
        let list = app
            .oneshot(
                axum::http::Request::builder()
                    .method("GET")
                    .uri("/v1/relay/bundles/device-b")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("list");
        let body = to_bytes(list.into_body(), 16 * 1024 * 1024)
            .await
            .expect("body")
            .to_vec();
        let value: serde_json::Value = serde_json::from_slice(&body).expect("json");
        assert_eq!(value["bundles"].as_array().expect("bundles").len(), 0);
    }

    #[tokio::test]
    async fn mailbox_bound_evicts_oldest_for_newest() {
        let (_guard, app) = test_relay(None);
        for index in 0..(MAILBOX_BUNDLE_LIMIT + 4) {
            let response = upload(
                app.clone(),
                "device-b",
                format!("bundle-{index}").as_bytes(),
            )
            .await;
            assert_eq!(response.status(), StatusCode::OK);
        }
        let list = app
            .oneshot(
                axum::http::Request::builder()
                    .method("GET")
                    .uri("/v1/relay/bundles/device-b")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("list");
        let body = to_bytes(list.into_body(), 16 * 1024 * 1024)
            .await
            .expect("body")
            .to_vec();
        let value: serde_json::Value = serde_json::from_slice(&body).expect("json");
        let bundles = value["bundles"].as_array().expect("bundles");
        assert_eq!(bundles.len(), MAILBOX_BUNDLE_LIMIT);
        let first_id = bundles[0]["id"].as_i64().expect("id");
        assert!(
            first_id > 4,
            "oldest bundles must have been evicted for the newest"
        );
    }
}
