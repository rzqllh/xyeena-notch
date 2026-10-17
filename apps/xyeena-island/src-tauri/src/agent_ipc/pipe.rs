//! Windows Named Pipe transport for local agent hooks.
//!
//! Provides a secured, per-user local Named Pipe endpoint with explicit
//! rejection of remote clients, bounded message processing, session tracking,
//! and emission to the Tauri Island frontend.

use crate::agent_ipc::event::parse_and_normalize;
use crate::agent_ipc::framing::FrameBuffer;
use crate::agent_ipc::SharedSessionRegistry;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use tauri::{Emitter, Runtime};

#[cfg(windows)]
use windows::core::HSTRING;
#[cfg(windows)]
use windows::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
#[cfg(windows)]
use windows::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
#[cfg(windows)]
use windows::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
#[cfg(windows)]
use windows::Win32::Storage::FileSystem::{ReadFile, PIPE_ACCESS_DUPLEX};
#[cfg(windows)]
use windows::Win32::System::Pipes::{
    ConnectNamedPipe, DisconnectNamedPipe, PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS,
    PIPE_TYPE_BYTE, PIPE_UNLIMITED_INSTANCES, PIPE_WAIT,
};

/// Get the localized, per-user named pipe path.
/// Format: `\\.\pipe\xyeena-agent-<username>`
pub fn get_pipe_name() -> String {
    let username = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "default".to_string());
    // Sanitize username for pipe name (alphanumeric and dashes only)
    let sanitized: String = username
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    format!(r"\\.\pipe\xyeena-agent-{}", sanitized)
}

/// Handle for controlling the running Named Pipe server thread.
pub struct NamedPipeServerHandle {
    running: Arc<AtomicBool>,
    thread_handle: Option<JoinHandle<()>>,
    pipe_name: String,
}

impl NamedPipeServerHandle {
    /// Stop the server loop and join the worker thread.
    pub fn stop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        // Ping pipe to unblock accept if waiting
        #[cfg(windows)]
        {
            use windows::Win32::Storage::FileSystem::{
                CreateFileW, FILE_GENERIC_READ, FILE_GENERIC_WRITE, FILE_SHARE_NONE, OPEN_EXISTING,
            };
            let pipe_w = HSTRING::from(&self.pipe_name);
            unsafe {
                let h = CreateFileW(
                    &pipe_w,
                    FILE_GENERIC_READ.0 | FILE_GENERIC_WRITE.0,
                    FILE_SHARE_NONE,
                    None,
                    OPEN_EXISTING,
                    Default::default(),
                    None,
                );
                if let Ok(handle) = h {
                    if handle != INVALID_HANDLE_VALUE {
                        let _ = CloseHandle(handle);
                    }
                }
            }
        }
        if let Some(th) = self.thread_handle.take() {
            let _ = th.join();
        }
    }

    pub fn pipe_name(&self) -> &str {
        &self.pipe_name
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}

impl Drop for NamedPipeServerHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Start the Windows Named Pipe server loop in a background thread.
pub fn start_agent_pipe_server<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    registry: SharedSessionRegistry,
) -> NamedPipeServerHandle {
    let pipe_name = get_pipe_name();
    let running = Arc::new(AtomicBool::new(true));

    let running_clone = Arc::clone(&running);
    let pipe_name_clone = pipe_name.clone();

    let thread_handle = thread::Builder::new()
        .name("xyeena-agent-ipc".into())
        .spawn(move || {
            run_server_loop(app, registry, pipe_name_clone, running_clone);
        })
        .expect("Failed to spawn agent IPC thread");

    NamedPipeServerHandle {
        running,
        thread_handle: Some(thread_handle),
        pipe_name,
    }
}

#[cfg(windows)]
fn run_server_loop<R: Runtime>(
    app: tauri::AppHandle<R>,
    registry: SharedSessionRegistry,
    pipe_name: String,
    running: Arc<AtomicBool>,
) {
    let pipe_name_w = HSTRING::from(&pipe_name);

    // Build explicit Security Descriptor:
    // "D:P(A;;GRGW;;;OW)" - Discretionary ACL, Protected, Grant Read/Write to Owner only.
    // This strictly prevents other Windows user sessions from connecting.
    let sddl = HSTRING::from("D:P(A;;GRGW;;;OW)");
    let mut sec_desc = PSECURITY_DESCRIPTOR::default();
    let sec_desc_res = unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            &sddl,
            SDDL_REVISION_1,
            &mut sec_desc,
            None,
        )
    };

    let sec_attrs = SECURITY_ATTRIBUTES {
        nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: if sec_desc_res.is_ok() {
            sec_desc.0
        } else {
            std::ptr::null_mut()
        },
        bInheritHandle: false.into(),
    };

    while running.load(Ordering::SeqCst) {
        let pipe_handle = unsafe {
            windows::Win32::System::Pipes::CreateNamedPipeW(
                &pipe_name_w,
                PIPE_ACCESS_DUPLEX,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                PIPE_UNLIMITED_INSTANCES,
                65536,
                65536,
                0,
                Some(&sec_attrs),
            )
        };

        if pipe_handle == INVALID_HANDLE_VALUE {
            thread::sleep(std::time::Duration::from_millis(200));
            continue;
        }

        // Wait for client connection
        let connected = unsafe { ConnectNamedPipe(pipe_handle, None) };
        if !connected.is_ok() {
            let _ = unsafe { CloseHandle(pipe_handle) };
            continue;
        }

        if !running.load(Ordering::SeqCst) {
            let _ = unsafe { DisconnectNamedPipe(pipe_handle) };
            let _ = unsafe { CloseHandle(pipe_handle) };
            break;
        }

        // Handle client stream
        handle_pipe_client(pipe_handle, &app, &registry);

        let _ = unsafe { DisconnectNamedPipe(pipe_handle) };
        let _ = unsafe { CloseHandle(pipe_handle) };
    }

    if !sec_desc.0.is_null() {
        let _ = unsafe {
            windows::Win32::Foundation::LocalFree(Some(windows::Win32::Foundation::HLOCAL(
                sec_desc.0,
            )))
        };
    }
}

#[cfg(not(windows))]
fn run_server_loop<R: Runtime>(
    _app: tauri::AppHandle<R>,
    _registry: SharedSessionRegistry,
    _pipe_name: String,
    _running: Arc<AtomicBool>,
) {
    // Non-Windows stub
}

#[cfg(windows)]
fn handle_pipe_client<R: Runtime>(
    pipe_handle: HANDLE,
    app: &tauri::AppHandle<R>,
    registry: &SharedSessionRegistry,
) {
    let mut frame_buf = FrameBuffer::new();
    let mut read_buf = [0u8; 8192];

    loop {
        let mut bytes_read = 0u32;
        let ok = unsafe {
            ReadFile(
                pipe_handle,
                Some(&mut read_buf),
                Some(&mut bytes_read),
                None,
            )
        };

        if !ok.is_ok() || bytes_read == 0 {
            break;
        }

        let chunk = &read_buf[..bytes_read as usize];
        if frame_buf.extend(chunk).is_err() {
            // Oversized payload or buffer flood -> drop client connection
            break;
        }

        // Drain complete frames
        loop {
            match frame_buf.next_frame() {
                Ok(Some(raw_value)) => {
                    if let Ok(event) = parse_and_normalize(&raw_value) {
                        registry.handle_event(&event);
                        let _ = app.emit("island:agent-event", &event);
                    }
                }
                Ok(None) => break,
                Err(_) => {
                    // Malformed JSON frame -> break to drop client
                    return;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pipe_name_is_non_empty_and_starts_with_pipe_prefix() {
        let name = get_pipe_name();
        assert!(name.starts_with(r"\\.\pipe\xyeena-agent-"));
        assert!(name.len() > r"\\.\pipe\xyeena-agent-".len());
    }

    #[cfg(windows)]
    #[test]
    fn test_named_pipe_roundtrip_message() {
        use crate::agent_ipc::framing::encode_frame;
        use serde_json::json;
        use windows::Win32::Storage::FileSystem::{
            CreateFileW, WriteFile, FILE_GENERIC_READ, FILE_GENERIC_WRITE, FILE_SHARE_NONE,
            OPEN_EXISTING,
        };

        let registry = SharedSessionRegistry::new();
        let pipe_name = format!(r"\\.\pipe\xyeena-test-pipe-{}", std::process::id());

        let pipe_name_clone = pipe_name.clone();
        let registry_clone = registry.clone();

        // Spawn a standalone pipe listener for test
        let listener = thread::spawn(move || {
            let pipe_name_w = HSTRING::from(&pipe_name_clone);
            let sddl = HSTRING::from("D:P(A;;GRGW;;;OW)");
            let mut sec_desc = PSECURITY_DESCRIPTOR::default();
            let _ = unsafe {
                ConvertStringSecurityDescriptorToSecurityDescriptorW(
                    &sddl,
                    SDDL_REVISION_1,
                    &mut sec_desc,
                    None,
                )
            };

            let sec_attrs = SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: sec_desc.0,
                bInheritHandle: false.into(),
            };

            let h = unsafe {
                windows::Win32::System::Pipes::CreateNamedPipeW(
                    &pipe_name_w,
                    PIPE_ACCESS_DUPLEX,
                    PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                    1,
                    4096,
                    4096,
                    0,
                    Some(&sec_attrs),
                )
            };
            assert_ne!(h, INVALID_HANDLE_VALUE);

            let _ = unsafe { ConnectNamedPipe(h, None) };

            let mut frame_buf = FrameBuffer::new();
            let mut buf = [0u8; 1024];
            let mut read = 0u32;
            let _ = unsafe { ReadFile(h, Some(&mut buf), Some(&mut read), None) };

            if read > 0 {
                frame_buf.extend(&buf[..read as usize]).unwrap();
                if let Ok(Some(val)) = frame_buf.next_frame() {
                    if let Ok(ev) = parse_and_normalize(&val) {
                        registry_clone.handle_event(&ev);
                    }
                }
            }

            let _ = unsafe { DisconnectNamedPipe(h) };
            let _ = unsafe { CloseHandle(h) };
            if !sec_desc.0.is_null() {
                let _ = unsafe {
                    windows::Win32::Foundation::LocalFree(Some(windows::Win32::Foundation::HLOCAL(
                        sec_desc.0,
                    )))
                };
            }
        });

        // Give listener a moment to bind
        thread::sleep(std::time::Duration::from_millis(50));

        // Connect client
        let pipe_w = HSTRING::from(&pipe_name);
        let client_h = unsafe {
            CreateFileW(
                &pipe_w,
                FILE_GENERIC_READ.0 | FILE_GENERIC_WRITE.0,
                FILE_SHARE_NONE,
                None,
                OPEN_EXISTING,
                Default::default(),
                None,
            )
        }
        .expect("Client connect must succeed");
        assert_ne!(client_h, INVALID_HANDLE_VALUE);

        let payload = json!({
            "event": "SessionStart",
            "provider": "claude-code",
            "session_id": "test-session-pipe-1"
        });
        let frame = encode_frame(&payload).expect("encode");

        let mut written = 0u32;
        let write_ok = unsafe { WriteFile(client_h, Some(&frame), Some(&mut written), None) };
        assert!(write_ok.is_ok());
        assert_eq!(written as usize, frame.len());

        let _ = unsafe { CloseHandle(client_h) };
        listener.join().expect("listener join");

        // Verify session was registered in registry
        let session = registry.active_sessions();
        assert_eq!(session.len(), 1);
        assert_eq!(session[0].provider, "claude-code");
        assert_eq!(session[0].session_id, "test-session-pipe-1");
    }
}
