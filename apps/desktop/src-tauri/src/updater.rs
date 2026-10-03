use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri_plugin_updater::{Error as UpdaterError, Update, UpdaterExt};
use tokio::sync::{Mutex as AsyncMutex, Notify};

use crate::settings;

const GITHUB_URL: &str = "https://github.com/adea-ai/cortana";
const MAX_RELEASE_NOTES_CHARS: usize = 32_000;
const UPDATE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30 * 60);
const CHANGELOG: &str = include_str!("../../../../CHANGELOG.md");

#[derive(Clone, Debug, Serialize)]
pub struct UpdateSnapshot {
    pub current_version: String,
    pub available_version: Option<String>,
    pub release_date: Option<String>,
    pub release_notes: Option<String>,
    pub changelog: String,
    pub github_url: &'static str,
    pub phase: &'static str,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub error: Option<String>,
    pub restart_required: bool,
}

impl Default for UpdateSnapshot {
    fn default() -> Self {
        Self {
            current_version: env!("CARGO_PKG_VERSION").into(),
            available_version: None,
            release_date: None,
            release_notes: None,
            changelog: CHANGELOG.to_string(),
            github_url: GITHUB_URL,
            phase: "idle",
            downloaded_bytes: 0,
            total_bytes: None,
            error: None,
            restart_required: false,
        }
    }
}

#[derive(Clone, Default)]
pub struct UpdaterState {
    operation: Arc<AsyncMutex<()>>,
    pending: Arc<AsyncMutex<Option<Update>>>,
    snapshot: Arc<Mutex<UpdateSnapshot>>,
    install_active: Arc<AtomicBool>,
    cancel_requested: Arc<AtomicBool>,
    cancel_notify: Arc<Notify>,
}

impl UpdaterState {
    pub fn status(&self) -> UpdateSnapshot {
        self.snapshot
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub async fn check<R: tauri::Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
    ) -> Result<UpdateSnapshot, String> {
        let _operation = self.operation.lock().await;
        {
            let mut pending = self.pending.lock().await;
            *pending = None;
        }
        self.update_snapshot(|snapshot| {
            snapshot.phase = "checking";
            snapshot.error = None;
            snapshot.available_version = None;
            snapshot.release_date = None;
            snapshot.release_notes = None;
            snapshot.downloaded_bytes = 0;
            snapshot.total_bytes = None;
            snapshot.restart_required = false;
        });
        // Keep the observable state fail-closed even when the updater plugin
        // cannot be initialized (for example in a headless test runtime). The
        // previous `?` returned while leaving the snapshot stuck at `checking`.
        // The configured channel resolves an explicit endpoint: the plugin
        // reads that release's signed manifest instead of the stable feed.
        // Opt-in channels never fall back to stable on resolution failure —
        // the check fails so the user sees the channel is unreachable.
        let channel = read_channel(app);
        let updater = match channel_endpoint(channel).await {
            Ok(Some(endpoint)) => {
                let mut builder = app.updater_builder();
                if channel == UpdateChannel::Dev {
                    // SemVer correctly orders `0.66.0-dev.3` below the stable
                    // `0.66.0`. For an explicitly selected dev channel, allow
                    // moving from stable to that same core version while
                    // keeping ordinary SemVer ordering on every other channel.
                    builder = builder.version_comparator(|current, update| {
                        dev_channel_version_is_newer(
                            (current.major, current.minor, current.patch),
                            current.pre.as_str(),
                            (
                                update.version.major,
                                update.version.minor,
                                update.version.patch,
                            ),
                            update.version.pre.as_str(),
                        )
                    });
                }
                builder
                    .endpoints(vec![endpoint])
                    .and_then(|builder| builder.build())
                    .map_err(|error| format!("initialize signed updater: {error}"))
            }
            Ok(None) => app
                .updater()
                .map_err(|error| format!("initialize signed updater: {error}")),
            Err(error) => Err(error),
        };
        let updater = match updater {
            Ok(updater) => updater,
            Err(error) => {
                self.update_snapshot(|snapshot| {
                    snapshot.phase = "failed";
                    snapshot.error = Some(error.clone());
                });
                return Err(error);
            }
        };

        // Transient fetch failures (release-publishing races, GitHub
        // propagation, network blips) resolve on retry, so the observable
        // phase stays `checking` across attempts and the error only surfaces
        // after the backoff is exhausted.
        let mut attempt = 0;
        let result = loop {
            let result = updater.check().await;
            match &result {
                Err(error) if is_retryable(error) && attempt + 1 < UPDATE_CHECK_ATTEMPTS => {
                    let delay =
                        UPDATE_CHECK_RETRY_DELAYS[attempt.min(UPDATE_CHECK_RETRY_DELAYS.len() - 1)];
                    attempt += 1;
                    tokio::time::sleep(delay).await;
                    continue;
                }
                _ => break result,
            }
        };

        match result {
            Ok(Some(update)) => {
                let available_version = update.version.clone();
                let release_date = update.date.map(|value| value.to_string());
                let release_notes = update
                    .body
                    .as_deref()
                    .map(|value| bounded(value, MAX_RELEASE_NOTES_CHARS));
                *self.pending.lock().await = Some(update);
                self.update_snapshot(|snapshot| {
                    snapshot.phase = "available";
                    snapshot.available_version = Some(available_version);
                    snapshot.release_date = release_date;
                    snapshot.release_notes = release_notes;
                    snapshot.error = None;
                    snapshot.restart_required = false;
                });
                Ok(self.status())
            }
            Ok(None) => {
                *self.pending.lock().await = None;
                self.update_snapshot(|snapshot| {
                    snapshot.phase = "current";
                    snapshot.available_version = None;
                    snapshot.release_date = None;
                    snapshot.release_notes = None;
                    snapshot.error = None;
                    snapshot.restart_required = false;
                });
                Ok(self.status())
            }
            Err(error) if is_target_unavailable(&error) => {
                *self.pending.lock().await = None;
                self.update_snapshot(|snapshot| {
                    // A release can be valid while deliberately omitting an
                    // unsigned or unavailable platform. Treat that as a
                    // supported no-update state instead of surfacing a
                    // misleading network/JSON failure to the user.
                    snapshot.phase = "unavailable";
                    snapshot.available_version = None;
                    snapshot.release_date = None;
                    snapshot.release_notes = None;
                    snapshot.error = None;
                    snapshot.restart_required = false;
                });
                Ok(self.status())
            }
            Err(error) => {
                let error = format!("check for signed Cortana update: {error}");
                *self.pending.lock().await = None;
                self.update_snapshot(|snapshot| {
                    snapshot.phase = "failed";
                    snapshot.error = Some(error.clone());
                });
                Err(error)
            }
        }
    }

    pub async fn install<R: tauri::Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        expected_version: &str,
        approved: bool,
        restart: bool,
    ) -> Result<UpdateSnapshot, String> {
        let _operation = self.operation.lock().await;
        let pending = self.pending.lock().await.take();
        let update = match validate_install_request(
            approved,
            expected_version,
            pending.as_ref().map(|update| update.version.as_str()),
        ) {
            Ok(()) => match pending {
                Some(update) => update,
                None => {
                    // Keep this path explicit even though validation currently
                    // requires a pending version. The pending slot is shared
                    // state; a future refactor must not turn an invariant
                    // violation into a desktop-process panic.
                    return Err(InstallGuardError::NoPendingUpdate.message());
                }
            },
            Err(guard) => {
                // Preserve an available update on every rejection so a
                // failed install attempt never silently drops it.
                if let Some(update) = pending {
                    *self.pending.lock().await = Some(update);
                }
                return Err(guard.message());
            }
        };

        self.cancel_requested.store(false, Ordering::Release);
        self.install_active.store(true, Ordering::Release);

        self.update_snapshot(|snapshot| {
            snapshot.phase = "downloading";
            snapshot.downloaded_bytes = 0;
            snapshot.total_bytes = None;
            snapshot.error = None;
        });
        audit("update.install.started", Some(expected_version), restart);

        let progress = self.snapshot.clone();
        let progress_finished = self.snapshot.clone();
        let retry = update.clone();
        let mut install_future = Box::pin(update.download_and_install(
            move |chunk, total| {
                let mut snapshot = progress
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                snapshot.phase = "downloading";
                snapshot.downloaded_bytes = snapshot.downloaded_bytes.saturating_add(chunk as u64);
                snapshot.total_bytes = total;
            },
            move || {
                let mut snapshot = progress_finished
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                snapshot.phase = "installing";
            },
        ));
        let mut cancel_future = Box::pin(wait_for_cancel(
            self.cancel_requested.clone(),
            self.cancel_notify.clone(),
        ));
        let result = match tokio::time::timeout(UPDATE_TIMEOUT, async {
            tokio::select! {
                // If installation has already completed, a late cancel
                // request must not relabel an installed update.
                biased;
                result = install_future.as_mut() => result.map_err(|error| {
                    InstallFailure::Error(format!(
                        "verify and install signed Cortana update: {error}"
                    ))
                }),
                _ = cancel_future.as_mut() => Err(InstallFailure::Cancelled),
            }
        })
        .await
        {
            Ok(result) => result,
            Err(_) => Err(InstallFailure::Error(format!(
                "signed Cortana update timed out after {} seconds",
                UPDATE_TIMEOUT.as_secs()
            ))),
        };

        self.install_active.store(false, Ordering::Release);

        if let Err(failure) = result {
            *self.pending.lock().await = Some(retry);
            match failure {
                InstallFailure::Cancelled => {
                    self.update_snapshot(|snapshot| {
                        snapshot.phase = "cancelled";
                        snapshot.error = None;
                        snapshot.restart_required = false;
                    });
                    audit("update.install.cancelled", Some(expected_version), restart);
                    return Ok(self.status());
                }
                InstallFailure::Error(error) => {
                    self.update_snapshot(|snapshot| {
                        snapshot.phase = "failed";
                        snapshot.error = Some(error.clone());
                    });
                    audit("update.install.failed", Some(expected_version), restart);
                    return Err(error);
                }
            }
        }

        self.update_snapshot(|snapshot| {
            snapshot.phase = "installed";
            snapshot.error = None;
            snapshot.restart_required = true;
        });
        audit("update.install.completed", Some(expected_version), restart);
        let snapshot = self.status();
        if restart {
            app.request_restart();
        }
        Ok(snapshot)
    }

    pub async fn cancel(&self) -> Result<UpdateSnapshot, String> {
        if !self.install_active.load(Ordering::Acquire) {
            return Ok(self.status());
        }

        self.cancel_requested.store(true, Ordering::Release);
        self.update_snapshot(|snapshot| {
            if matches!(snapshot.phase, "downloading" | "installing") {
                snapshot.phase = "cancelling";
            }
        });
        self.cancel_notify.notify_waiters();
        Ok(self.status())
    }

    fn update_snapshot(&self, update: impl FnOnce(&mut UpdateSnapshot)) {
        let mut snapshot = self
            .snapshot
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        update(&mut snapshot);
    }
}

/// A rejected install request, kept distinct so the caller can tell a
/// missing pending update (nothing to restore) from a changed one (must be
/// preserved for a retry).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum InstallGuardError {
    ApprovalRequired,
    InvalidVersion,
    NoPendingUpdate,
    VersionMismatch,
}

enum InstallFailure {
    Cancelled,
    Error(String),
}

async fn wait_for_cancel(flag: Arc<AtomicBool>, notify: Arc<Notify>) {
    loop {
        if flag.load(Ordering::Acquire) {
            return;
        }
        let notified = notify.notified();
        tokio::pin!(notified);
        // Register the notification before the second flag check so a cancel
        // between the first check and await cannot be lost.
        if flag.load(Ordering::Acquire) {
            return;
        }
        notified.await;
    }
}

impl InstallGuardError {
    fn message(&self) -> String {
        match self {
            Self::ApprovalRequired => "update installation requires explicit approval".into(),
            Self::InvalidVersion => "invalid expected update version".into(),
            Self::NoPendingUpdate => "check for an update before installing".into(),
            Self::VersionMismatch => {
                "available update changed; check again before installing".into()
            }
        }
    }
}

/// Validate the preconditions for installing a pending update.
///
/// Pure so the approval, version and pending guards can be unit tested
/// without the updater plugin or any network access. The caller takes the
/// pending update before invoking this and restores it on every rejection
/// so an available update always survives a failed install attempt.
fn validate_install_request(
    approved: bool,
    expected_version: &str,
    pending_version: Option<&str>,
) -> Result<(), InstallGuardError> {
    if !approved {
        return Err(InstallGuardError::ApprovalRequired);
    }
    if expected_version.is_empty() || expected_version.len() > 64 {
        return Err(InstallGuardError::InvalidVersion);
    }
    match pending_version {
        None => Err(InstallGuardError::NoPendingUpdate),
        Some(pending) if pending != expected_version => Err(InstallGuardError::VersionMismatch),
        Some(_) => Ok(()),
    }
}

fn audit(event: &str, version: Option<&str>, restart: bool) {
    let value = serde_json::json!({
        "at_unix_seconds": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        "event": event,
        "version": version,
        "restart_requested": restart,
        "secret_values_recorded": false,
    });
    let _ = settings::append_audit_event(&settings::default_config_path(), &value);
}

fn bounded(value: &str, max_bytes: usize) -> String {
    if value.len() <= max_bytes {
        return value.to_string();
    }
    // Floor at a UTF-8 boundary so multi-byte characters are never split.
    let mut end = max_bytes;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    value[..end].to_string()
}

fn is_target_unavailable(error: &UpdaterError) -> bool {
    matches!(
        error,
        UpdaterError::TargetNotFound(_) | UpdaterError::TargetsNotFound(_)
    )
}

/// Transient failures resolve on retry: the `releases/latest/download`
/// endpoint 404s for the whole window between a release being cut and its
/// `latest.json` manifest landing (the desktop assets build minutes behind
/// the tag), and GitHub propagation plus ordinary network blips produce
/// one-off fetch failures. Permanent failures — a bad signature, a semver
/// or serialization error, an unsupported platform — would fail identically
/// on retry, so they surface immediately.
fn is_retryable(error: &UpdaterError) -> bool {
    matches!(
        error,
        UpdaterError::ReleaseNotFound
            | UpdaterError::Reqwest(_)
            | UpdaterError::Io(_)
            | UpdaterError::Network(_)
    )
}

const UPDATE_CHECK_ATTEMPTS: usize = 3;
const UPDATE_CHECK_RETRY_DELAYS: [Duration; 2] = [Duration::from_secs(2), Duration::from_secs(5)];

// ── Update channels ────────────────────────────────────────────────────────
//
// Stable (the default) reads the moving `releases/latest/download/latest.json`
// manifest configured in tauri.conf.json. The opt-in channels resolve their
// newest release through the GitHub API and read that release's signed
// manifest: the API only discovers the tag, and every signature check the
// updater plugin applies stays intact. Opt-in channels never fall back to
// stable — an install that chose dev must not be offered stable releases
// when its channel is unreachable; it reports the failure instead.

/// The update channel an installation follows.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum UpdateChannel {
    #[default]
    Stable,
    PreRelease,
    Dev,
}

impl UpdateChannel {
    pub const ALL: [UpdateChannel; 3] = [Self::Stable, Self::PreRelease, Self::Dev];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Stable => "stable",
            Self::PreRelease => "pre-release",
            Self::Dev => "dev",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|channel| channel.as_str() == value)
    }
}

impl std::fmt::Display for UpdateChannel {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// Whether `tag` (a GitHub release tag) carries the builds a channel follows:
/// stable and pre-release share the plain `vX.Y.Z` shape (visibility is the
/// GitHub pre-release flag, not the tag), and dev builds are `vX.Y.Z-dev.N`.
fn channel_tag_matches(tag: &str, channel: UpdateChannel) -> bool {
    let Some(rest) = tag.strip_prefix('v') else {
        return false;
    };
    let (core, dev_counter) = match rest.split_once("-dev.") {
        Some((core, counter)) => (core, Some(counter)),
        None => (rest, None),
    };
    let numeric = |value: &str| !value.is_empty() && value.chars().all(|c| c.is_ascii_digit());
    let components = core.split('.').collect::<Vec<_>>();
    if components.len() != 3 || !components.iter().all(|part| numeric(part)) {
        return false;
    }
    match dev_counter {
        Some(counter) => channel == UpdateChannel::Dev && numeric(counter),
        None => channel != UpdateChannel::Dev,
    }
}

const RELEASES_API_URL: &str = "https://api.github.com/repos/adea-ai/cortana/releases?per_page=30";
const CHANNEL_FILE_NAME: &str = "update-channel.json";

pub fn read_channel<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> UpdateChannel {
    use tauri::Manager;

    let Ok(data_dir) = app.path().app_data_dir() else {
        return UpdateChannel::Stable;
    };
    let Ok(raw) = std::fs::read_to_string(data_dir.join(CHANNEL_FILE_NAME)) else {
        return UpdateChannel::Stable;
    };
    parse_saved_channel(&raw)
}

fn parse_saved_channel(raw: &str) -> UpdateChannel {
    if let Ok(channel) = serde_json::from_str::<UpdateChannel>(raw) {
        return channel;
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else {
        return UpdateChannel::Stable;
    };
    let channel = value
        .get("channel")
        .and_then(serde_json::Value::as_str)
        // Accept the old bare-enum representation too, so a pre-release build
        // that happened to persist it keeps its selected channel.
        .or_else(|| value.as_str());
    channel
        .and_then(UpdateChannel::parse)
        .unwrap_or(UpdateChannel::Stable)
}

/// Persist the channel and record the change in the audit log. The file lives
/// in the shell's app data directory (never web-side storage): the updater
/// reads it from the shell process on every check, so a settings change takes
/// effect without a restart, and a corrupted file degrades to stable.
pub fn save_channel<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    channel: UpdateChannel,
) -> Result<(), String> {
    use tauri::Manager;

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data dir: {error}"))?;
    std::fs::create_dir_all(&data_dir).map_err(|error| format!("create app data dir: {error}"))?;
    let body = serde_json::json!({ "channel": channel.as_str() });
    std::fs::write(data_dir.join(CHANNEL_FILE_NAME), body.to_string())
        .map_err(|error| format!("write update channel: {error}"))?;
    audit("update_channel_changed", Some(channel.as_str()), false);
    Ok(())
}

/// The endpoint a channel checks, or `None` for stable: the plugin then reads
/// its configured `releases/latest` manifest unchanged.
fn resolve_channel_endpoint_from_releases(
    releases: &serde_json::Value,
    channel: UpdateChannel,
) -> Result<tauri::Url, String> {
    let Some(releases) = releases.as_array() else {
        return Err(format!("no {channel} release is published yet"));
    };
    for release in releases {
        let tag = release
            .get("tag_name")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        if release.get("draft").and_then(serde_json::Value::as_bool) == Some(false)
            && release
                .get("prerelease")
                .and_then(serde_json::Value::as_bool)
                == Some(true)
            && channel_tag_matches(tag, channel)
            && release_has_latest_manifest(release)
        {
            return tauri::Url::parse(&format!(
                "https://github.com/adea-ai/cortana/releases/download/{tag}/latest.json"
            ))
            .map_err(|error| format!("parse channel endpoint: {error}"));
        }
    }
    Err(format!("no {channel} release is published yet"))
}

fn release_has_latest_manifest(release: &serde_json::Value) -> bool {
    release
        .get("assets")
        .and_then(serde_json::Value::as_array)
        .is_some_and(|assets| {
            assets.iter().any(|asset| {
                asset.get("name").and_then(serde_json::Value::as_str) == Some("latest.json")
            })
        })
}

async fn resolve_channel_endpoint(channel: UpdateChannel) -> Result<tauri::Url, String> {
    let client = release_list_client()?;
    let releases: serde_json::Value = client
        .get(RELEASES_API_URL)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| format!("list GitHub releases: {error}"))?
        .error_for_status()
        .map_err(|error| format!("list GitHub releases: {error}"))?
        .json()
        .await
        .map_err(|error| format!("decode GitHub releases: {error}"))?;
    resolve_channel_endpoint_from_releases(&releases, channel)
}

fn release_list_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("Cortana/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("build update channel client: {error}"))
}

/// The endpoint override for the configured channel: `None` lets the plugin
/// read its configured stable feed.
async fn channel_endpoint(channel: UpdateChannel) -> Result<Option<tauri::Url>, String> {
    match channel {
        UpdateChannel::Stable => Ok(None),
        channel => resolve_channel_endpoint(channel).await.map(Some),
    }
}

fn dev_channel_version_is_newer(
    current_core: (u64, u64, u64),
    current_pre: &str,
    remote_core: (u64, u64, u64),
    remote_pre: &str,
) -> bool {
    let Some(remote_counter) = dev_counter(remote_pre) else {
        return false;
    };
    match remote_core.cmp(&current_core) {
        std::cmp::Ordering::Greater => true,
        std::cmp::Ordering::Less => false,
        std::cmp::Ordering::Equal => match current_pre {
            "" => true,
            pre => dev_counter(pre).is_some_and(|counter| remote_counter > counter),
        },
    }
}

fn dev_counter(prerelease: &str) -> Option<u64> {
    let counter = prerelease.strip_prefix("dev.")?;
    let parsed = counter.parse::<u64>().ok()?;
    // SemVer numeric identifiers cannot have leading zeroes; keep the same
    // strict grammar here even though GitHub tag matching only checks digits.
    (parsed.to_string() == counter).then_some(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_contains_full_changelog_and_release_metadata() {
        let snapshot = UpdateSnapshot::default();
        assert_eq!(snapshot.current_version, env!("CARGO_PKG_VERSION"));
        assert_eq!(snapshot.github_url, GITHUB_URL);
        assert_eq!(snapshot.changelog, CHANGELOG);
        assert!(snapshot.changelog.len() > MAX_RELEASE_NOTES_CHARS);
        assert_eq!(bounded("cortana", 4), "cort");
    }

    #[test]
    fn missing_platform_is_a_nonfatal_update_state() {
        assert!(is_target_unavailable(&UpdaterError::TargetNotFound(
            "darwin-aarch64".into()
        )));
        assert!(is_target_unavailable(&UpdaterError::TargetsNotFound(vec![
            "darwin-aarch64-app".into(),
            "darwin-aarch64".into(),
        ])));
        assert!(!is_target_unavailable(&UpdaterError::ReleaseNotFound));
    }

    #[test]
    fn channel_tags_split_stable_from_dev_builds() {
        // The pre-release channel follows the plain shape; dev builds carry a
        // -dev.N counter and never leak into it.
        assert!(channel_tag_matches("v0.65.3", UpdateChannel::PreRelease));
        assert!(!channel_tag_matches(
            "v0.65.3-dev.1",
            UpdateChannel::PreRelease
        ));
        // The dev channel follows exactly the dev shape.
        assert!(channel_tag_matches("v0.65.3-dev.1", UpdateChannel::Dev));
        assert!(!channel_tag_matches("v0.65.3", UpdateChannel::Dev));
        assert!(!channel_tag_matches("v0.65.3-dev.beta", UpdateChannel::Dev));
        // Stable sees only the plain shape too: pre-releases are the same
        // version grammar, gated by the GitHub flag instead of the tag.
        assert!(channel_tag_matches("v0.65.3", UpdateChannel::Stable));
        assert!(!channel_tag_matches("v0.65.3-dev.1", UpdateChannel::Stable));
        // Malformed tags match nothing.
        assert!(!channel_tag_matches("0.65.3", UpdateChannel::PreRelease));
        assert!(!channel_tag_matches("v0.65", UpdateChannel::PreRelease));
        assert!(!channel_tag_matches("v0.65.x-dev.1", UpdateChannel::Dev));
        assert!(!channel_tag_matches("", UpdateChannel::Dev));
    }

    #[test]
    fn channel_names_round_trip_through_parse() {
        for channel in UpdateChannel::ALL {
            assert_eq!(UpdateChannel::parse(channel.as_str()), Some(channel));
        }
        assert_eq!(UpdateChannel::parse("beta"), None);
        assert_eq!(UpdateChannel::parse(""), None);
        assert_eq!(UpdateChannel::default(), UpdateChannel::Stable);
    }

    #[test]
    fn saved_channel_reads_the_object_written_by_save() {
        assert_eq!(
            parse_saved_channel(r#"{"channel":"dev"}"#),
            UpdateChannel::Dev
        );
        assert_eq!(
            parse_saved_channel(r#"{"channel":"pre-release"}"#),
            UpdateChannel::PreRelease
        );
        assert_eq!(parse_saved_channel(r#""Dev""#), UpdateChannel::Dev);
        assert_eq!(
            parse_saved_channel(r#"{"channel":"unknown"}"#),
            UpdateChannel::Stable
        );
    }

    #[test]
    fn dev_channel_version_comparator_allows_same_core_and_newer_dev_builds() {
        assert!(dev_channel_version_is_newer(
            (0, 66, 0),
            "",
            (0, 66, 0),
            "dev.3"
        ));
        assert!(dev_channel_version_is_newer(
            (0, 66, 0),
            "dev.3",
            (0, 66, 0),
            "dev.4"
        ));
        assert!(dev_channel_version_is_newer(
            (0, 66, 0),
            "",
            (0, 67, 0),
            "dev.1"
        ));
    }

    #[test]
    fn dev_channel_version_comparator_rejects_old_or_malformed_releases() {
        assert!(!dev_channel_version_is_newer(
            (0, 66, 0),
            "",
            (0, 65, 9),
            "dev.99"
        ));
        assert!(!dev_channel_version_is_newer(
            (0, 66, 0),
            "dev.3",
            (0, 66, 0),
            "dev.3"
        ));
        assert!(!dev_channel_version_is_newer(
            (0, 66, 0),
            "dev.3",
            (0, 66, 0),
            "dev.2"
        ));
        assert!(!dev_channel_version_is_newer(
            (0, 66, 0),
            "",
            (0, 66, 0),
            "rc.1"
        ));
        assert!(!dev_channel_version_is_newer(
            (0, 66, 0),
            "",
            (0, 66, 0),
            "dev.03"
        ));
    }

    #[test]
    fn channel_resolver_skips_newest_release_without_manifest() {
        let releases = serde_json::json!([
            {
                "tag_name": "v0.66.0-dev.3",
                "draft": false,
                "prerelease": true,
                "assets": [{"name": "Cortana.dmg"}]
            },
            {
                "tag_name": "v0.66.0-dev.2",
                "draft": false,
                "prerelease": true,
                "assets": [{"name": "latest.json"}]
            }
        ]);

        let endpoint = resolve_channel_endpoint_from_releases(&releases, UpdateChannel::Dev)
            .expect("older complete dev release remains installable");
        assert_eq!(
            endpoint.as_str(),
            "https://github.com/adea-ai/cortana/releases/download/v0.66.0-dev.2/latest.json"
        );
    }

    #[test]
    fn channel_resolver_reports_no_release_when_manifests_are_missing() {
        let releases = serde_json::json!([{
            "tag_name": "v0.66.0-dev.3",
            "draft": false,
            "prerelease": true,
            "assets": [{"name": "Cortana.dmg"}]
        }]);

        assert_eq!(
            resolve_channel_endpoint_from_releases(&releases, UpdateChannel::Dev).unwrap_err(),
            "no dev release is published yet"
        );
    }

    #[tokio::test]
    async fn release_list_client_sends_the_cortana_user_agent() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind local HTTP server");
        let address = listener.local_addr().expect("read local HTTP address");
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("accept API request");
            let mut request = Vec::new();
            let mut buffer = [0; 1024];
            loop {
                let read = stream.read(&mut buffer).await.expect("read API request");
                if read == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..read]);
                if request.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: 2\r\nconnection: close\r\n\r\n[]",
                )
                .await
                .expect("write API response");
            String::from_utf8(request).expect("decode API request")
        });

        release_list_client()
            .expect("build release-list client")
            .get(format!("http://{address}/releases"))
            .send()
            .await
            .expect("send release-list request")
            .error_for_status()
            .expect("accept release-list response");
        let request = server.await.expect("finish local API server");
        let expected = format!("user-agent: Cortana/{}", env!("CARGO_PKG_VERSION"));
        assert!(
            request
                .lines()
                .any(|line| line.eq_ignore_ascii_case(&expected)),
            "request omitted {expected:?}: {request}"
        );
    }

    #[test]
    fn install_guard_rejects_without_approval() {
        let result = validate_install_request(false, "1.2.3", Some("1.2.3"));
        assert_eq!(result, Err(InstallGuardError::ApprovalRequired));
        assert_eq!(
            result.unwrap_err().message(),
            "update installation requires explicit approval"
        );
    }

    #[test]
    fn install_guard_rejects_empty_and_oversized_versions() {
        assert_eq!(
            validate_install_request(true, "", Some("1.2.3")),
            Err(InstallGuardError::InvalidVersion)
        );
        let oversized = "x".repeat(65);
        assert_eq!(
            validate_install_request(true, &oversized, Some("1.2.3")),
            Err(InstallGuardError::InvalidVersion)
        );
        // The version guard is checked before the pending guard, matching
        // the installer's original check ordering.
        assert_eq!(
            validate_install_request(true, "", None),
            Err(InstallGuardError::InvalidVersion)
        );
    }

    #[test]
    fn install_guard_rejects_without_pending_update() {
        let result = validate_install_request(true, "1.2.3", None);
        assert_eq!(result, Err(InstallGuardError::NoPendingUpdate));
        assert_eq!(
            result.unwrap_err().message(),
            "check for an update before installing"
        );
    }

    #[test]
    fn install_guard_accepts_matching_pending_version() {
        assert_eq!(
            validate_install_request(true, "1.2.3", Some("1.2.3")),
            Ok(())
        );
    }

    #[test]
    fn install_guard_rejects_mismatch_and_preserves_pending_update() {
        // `Update` cannot be constructed without the updater plugin, so the
        // caller contract of `install` is exercised with a version stub:
        // the pending value is taken, the guard runs, and a rejected guard
        // restores it so a retry still sees the available update.
        let mut pending: Option<String> = Some("2.0.0".into());
        let taken = pending.take();
        let result = validate_install_request(true, "1.2.3", taken.as_deref());
        assert_eq!(result, Err(InstallGuardError::VersionMismatch));
        assert_eq!(
            result.unwrap_err().message(),
            "available update changed; check again before installing"
        );
        pending = taken;
        assert_eq!(
            pending.as_deref(),
            Some("2.0.0"),
            "available update survives a rejected install"
        );
    }

    #[test]
    fn install_guards_fail_closed_without_network() {
        let app = tauri::test::mock_app();
        let state = UpdaterState::default();
        let error = tauri::async_runtime::block_on(async {
            state.install(app.handle(), "1.2.3", false, false).await
        })
        .unwrap_err();
        assert_eq!(error, "update installation requires explicit approval");
        let pending_is_empty =
            tauri::async_runtime::block_on(async { state.pending.lock().await.is_none() });
        assert!(pending_is_empty);
    }

    #[test]
    fn install_rejects_invalid_version_without_network() {
        let app = tauri::test::mock_app();
        let state = UpdaterState::default();
        for expected in ["".to_string(), "x".repeat(65)] {
            let error = tauri::async_runtime::block_on(async {
                state.install(app.handle(), &expected, true, false).await
            })
            .unwrap_err();
            assert_eq!(error, "invalid expected update version");
        }
    }

    #[test]
    fn install_rejects_without_pending_update_without_network() {
        let app = tauri::test::mock_app();
        let state = UpdaterState::default();
        let error = tauri::async_runtime::block_on(async {
            state.install(app.handle(), "1.2.3", true, false).await
        })
        .unwrap_err();
        assert_eq!(error, "check for an update before installing");
    }

    #[test]
    fn cancel_without_active_install_is_a_noop() {
        let state = UpdaterState::default();
        let snapshot = tauri::async_runtime::block_on(state.cancel()).expect("cancel status");
        assert_eq!(snapshot.phase, "idle");
        assert!(!snapshot.restart_required);
    }

    #[test]
    fn cancel_marks_an_active_install_without_requesting_restart() {
        let state = UpdaterState::default();
        state.install_active.store(true, Ordering::Release);
        state.update_snapshot(|snapshot| snapshot.phase = "downloading");

        let snapshot = tauri::async_runtime::block_on(state.cancel()).expect("cancel status");

        assert_eq!(snapshot.phase, "cancelling");
        assert!(!snapshot.restart_required);
        assert!(state.cancel_requested.load(Ordering::Acquire));
    }

    #[test]
    fn cancel_wakes_the_in_flight_install_waiter() {
        let state = UpdaterState::default();
        state.install_active.store(true, Ordering::Release);

        let completed = tauri::async_runtime::block_on(async {
            let waiter = tokio::spawn(wait_for_cancel(
                state.cancel_requested.clone(),
                state.cancel_notify.clone(),
            ));
            state.cancel().await.expect("cancel status");
            tokio::time::timeout(std::time::Duration::from_millis(100), waiter)
                .await
                .is_ok()
        });

        assert!(completed, "cancellation must release the in-flight waiter");
    }
}

#[cfg(test)]
mod retry_classification {
    use super::*;

    #[test]
    fn release_not_found_is_retryable() {
        let error = UpdaterError::ReleaseNotFound;
        assert!(is_retryable(&error));
    }

    #[test]
    fn permanent_failures_surface_immediately() {
        assert!(!is_retryable(&UpdaterError::EmptyEndpoints));
        assert!(!is_retryable(&UpdaterError::UnsupportedOs));
    }
}
