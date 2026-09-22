//! Shared helpers for the desktop's bounded-output background jobs.

use std::time::{SystemTime, UNIX_EPOCH};

use tauri_plugin_shell::process::CommandChild;

/// Append `bytes` to `buffer`, keeping the buffer at or below `maximum`
/// bytes by dropping everything past the limit.
pub(crate) fn append_bounded(buffer: &mut Vec<u8>, bytes: &[u8], maximum: usize) {
    let remaining = maximum.saturating_sub(buffer.len());
    buffer.extend_from_slice(&bytes[..bytes.len().min(remaining)]);
}

/// Seconds since the Unix epoch; 0 if the clock is before the epoch.
pub(crate) fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Kill a spawned shell child's whole process group, then the child. The
/// bundled CLI opts into its own process group so a timeout also terminates
/// connector/service helpers it may have started.
pub(crate) fn terminate_process_group(child: CommandChild) {
    #[cfg(unix)]
    {
        let pid = child.pid();
        if pid > 0 && pid <= i32::MAX as u32 {
            let _ = unsafe { libc::kill(-(pid as libc::pid_t), libc::SIGKILL) };
        }
    }
    let _ = child.kill();
}
