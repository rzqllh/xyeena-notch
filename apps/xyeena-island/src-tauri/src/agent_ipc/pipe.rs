//! Windows Named Pipe transport for local agent hooks.
//!
//! Provides a secured, per-user local Named Pipe endpoint with explicit
//! rejection of remote clients, bounded message processing, session tracking,
//! and emission to the Tauri Island frontend.
//!
//! # Threat Model & Local Security Boundary
//!
//! - **Remote Rejection**: The pipe strictly enforces `PIPE_REJECT_REMOTE_CLIENTS` to
//!   prevent cross-network and SMB/RPC named pipe connections.
//! - **Per-User Isolation**: The DACL (`D:P(A;;GRGW;;;OW)`) restricts pipe creation
//!   and connection to the local owner token, preventing other Windows user sessions
//!   from snooping or injecting events.
//! - **Same-User Spoofing Limitation**: Processes running under the *same Windows user session*
//!   share user token privileges and can connect to this pipe. Therefore, claims
//!   in the payload (e.g. `provider`, `session_id`, `cwd`) are **untrusted claims** and must
//!   never be treated as cryptographic proof of provider authenticity without independent
//!   process verification. In later slices (S05 approvals), authoritative verification
//!   gates are applied.

use crate::agent_ipc::approval::{
    is_provider_interactive, QuestionOption, RegisterApprovalParams, SharedApprovalRegistry,
};
use crate::agent_ipc::event::{parse_and_normalize, NormalizedEventType};
use crate::agent_ipc::framing::FrameBuffer;
use crate::agent_ipc::SharedSessionRegistry;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use tauri::{Emitter, Runtime};

#[cfg(windows)]
use windows::core::{HSTRING, PWSTR};
#[cfg(windows)]
use windows::Win32::Foundation::{CloseHandle, LocalFree, HANDLE, HLOCAL, INVALID_HANDLE_VALUE};
#[cfg(windows)]
use windows::Win32::Security::Authorization::{
    ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
#[cfg(windows)]
use windows::Win32::Security::{
    GetTokenInformation, TokenUser, PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES, TOKEN_QUERY,
    TOKEN_USER,
};
#[cfg(windows)]
use windows::Win32::Storage::FileSystem::{ReadFile, PIPE_ACCESS_DUPLEX};
#[cfg(windows)]
use windows::Win32::System::Pipes::{
    ConnectNamedPipe, DisconnectNamedPipe, PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS,
    PIPE_TYPE_BYTE, PIPE_UNLIMITED_INSTANCES, PIPE_WAIT,
};
#[cfg(windows)]
use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

/// Builds the pipe SDDL string.
/// If an explicit user SID is supplied, restricts access strictly to that account:
/// `D:P(A;;GRGW;;;<SID>)`.
/// Falls back to owner rights (`OW`) if SID query is unavailable.
pub fn build_pipe_sddl(user_sid: Option<&str>) -> String {
    if let Some(sid) = user_sid {
        format!("D:P(A;;GRGW;;;{})", sid)
    } else {
        "D:P(A;;GRGW;;;OW)".to_string()
    }
}

/// Retrieves the current process user account SID as a string (e.g. S-1-5-21-...).
#[cfg(windows)]
pub fn get_current_user_sid_string() -> Option<String> {
    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return None;
        }

        let mut len = 0u32;
        let _ = GetTokenInformation(token, TokenUser, None, 0, &mut len);
        if len == 0 {
            let _ = CloseHandle(token);
            return None;
        }

        let mut buf = vec![0u8; len as usize];
        if GetTokenInformation(
            token,
            TokenUser,
            Some(buf.as_mut_ptr() as *mut _),
            len,
            &mut len,
        )
        .is_err()
        {
            let _ = CloseHandle(token);
            return None;
        }

        let token_user = &*(buf.as_ptr() as *const TOKEN_USER);
        let mut str_sid = PWSTR::null();
        let conv_res = ConvertSidToStringSidW(token_user.User.Sid, &mut str_sid);
        let _ = CloseHandle(token);

        if conv_res.is_ok() && !str_sid.is_null() {
            let sid_str = str_sid.to_string().ok();
            let _ = LocalFree(Some(HLOCAL(str_sid.0 as _)));
            sid_str
        } else {
            None
        }
    }
}

#[cfg(not(windows))]
pub fn get_current_user_sid_string() -> Option<String> {
    None
}

/// Get the localized, per-user named pipe path.
/// Format: `\\.\pipe\xyeena-agent-<username>`
pub fn get_pipe_name() -> String {
    if let Ok(override_name) = std::env::var("XYEENA_AGENT_PIPE_NAME") {
        if !override_name.is_empty() {
            return override_name;
        }
    }
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
    approval_registry: SharedApprovalRegistry,
) -> NamedPipeServerHandle {
    let pipe_name = get_pipe_name();
    let running = Arc::new(AtomicBool::new(true));

    let running_clone = Arc::clone(&running);
    let pipe_name_clone = pipe_name.clone();

    let thread_handle = thread::Builder::new()
        .name("xyeena-agent-ipc".into())
        .spawn(move || {
            run_server_loop(
                app,
                registry,
                approval_registry,
                pipe_name_clone,
                running_clone,
            );
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
    approval_registry: SharedApprovalRegistry,
    pipe_name: String,
    running: Arc<AtomicBool>,
) {
    let pipe_name_w = HSTRING::from(&pipe_name);

    // Build explicit Security Descriptor with current user SID:
    let sid = get_current_user_sid_string();
    let sddl_str = build_pipe_sddl(sid.as_deref());
    let sddl = HSTRING::from(&sddl_str);
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
        let is_connected = connected.is_ok()
            || connected
                .as_ref()
                .err()
                .map(|e| e.code() == windows::Win32::Foundation::WIN32_ERROR(535).to_hresult())
                .unwrap_or(false);
        if !is_connected {
            let _ = unsafe { CloseHandle(pipe_handle) };
            continue;
        }

        if !running.load(Ordering::SeqCst) {
            let _ = unsafe { DisconnectNamedPipe(pipe_handle) };
            let _ = unsafe { CloseHandle(pipe_handle) };
            break;
        }

        // Handle client stream
        handle_pipe_client(pipe_handle, &app, &registry, &approval_registry);

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
    _approval_registry: SharedApprovalRegistry,
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
    approval_registry: &SharedApprovalRegistry,
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

                        if event.event_type == NormalizedEventType::SessionEnd {
                            approval_registry
                                .cancel_session_requests(&event.provider, &event.session_id);
                        } else if event.event_type == NormalizedEventType::PermissionRequest
                            && is_provider_interactive(&event.provider)
                        {
                            let request_id = raw_value
                                .get("request_id")
                                .or_else(|| raw_value.get("requestId"))
                                .or_else(|| raw_value.get("id"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                                .unwrap_or_else(|| {
                                    format!("{}-{}", event.session_id, event.timestamp_ms)
                                });

                            let tool_name =
                                event.tool_name.clone().unwrap_or_else(|| "Tool".into());
                            let tool_cmd =
                                event.tool_input.as_ref().and_then(|i| i.command.clone());
                            let tool_summary =
                                event.tool_input.as_ref().and_then(|i| i.summary.clone());

                            let question = raw_value
                                .get("question")
                                .or_else(|| raw_value.get("prompt"))
                                .or_else(|| raw_value.get("message"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());

                            let options =
                                raw_value
                                    .get("options")
                                    .and_then(|v| v.as_array())
                                    .map(|arr| {
                                        arr.iter()
                                            .filter_map(|item| {
                                                let id = item.get("id")?.as_str()?.to_string();
                                                let label =
                                                    item.get("label")?.as_str()?.to_string();
                                                let desc = item
                                                    .get("description")
                                                    .and_then(|d| d.as_str())
                                                    .map(|s| s.to_string());
                                                Some(QuestionOption {
                                                    id,
                                                    label,
                                                    description: desc,
                                                })
                                            })
                                            .collect::<Vec<_>>()
                                    });

                            let params = RegisterApprovalParams {
                                provider_request_id: request_id,
                                provider: event.provider.clone(),
                                session_id: event.session_id.clone(),
                                workspace_root: event.workspace_root.clone(),
                                tool_name,
                                tool_kind: None,
                                tool_command: tool_cmd,
                                tool_input_summary: tool_summary,
                                question,
                                options,
                                authenticated_origin: None,
                                timeout_ms: None,
                            };

                            if let Ok(snapshot) =
                                approval_registry.register_request(params, event.timestamp_ms)
                            {
                                let _ = app.emit("island:approval-requested", &snapshot);
                            }
                        }
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

        // Wait for listener to bind and connect client with retry
        let pipe_w = HSTRING::from(&pipe_name);
        let mut client_h = INVALID_HANDLE_VALUE;
        for _ in 0..50 {
            let h = unsafe {
                CreateFileW(
                    &pipe_w,
                    FILE_GENERIC_READ.0 | FILE_GENERIC_WRITE.0,
                    FILE_SHARE_NONE,
                    None,
                    OPEN_EXISTING,
                    Default::default(),
                    None,
                )
            };
            if let Ok(handle) = h {
                if handle != INVALID_HANDLE_VALUE {
                    client_h = handle;
                    break;
                }
            }
            thread::sleep(std::time::Duration::from_millis(20));
        }
        assert_ne!(
            client_h, INVALID_HANDLE_VALUE,
            "Client connect must succeed"
        );
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

    #[cfg(windows)]
    #[test]
    fn test_unauthorized_client_rejection_by_deny_dacl() {
        use windows::Win32::Storage::FileSystem::{
            CreateFileW, FILE_GENERIC_READ, FILE_GENERIC_WRITE, FILE_SHARE_NONE, OPEN_EXISTING,
        };

        let pipe_name = format!(r"\\.\pipe\xyeena-deny-pipe-{}", std::process::id());
        let pipe_name_w = HSTRING::from(&pipe_name);

        // Explicit Deny Everyone DACL: "D:P(D;;GA;;;WD)"
        let sddl = HSTRING::from("D:P(D;;GA;;;WD)");
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

        let pipe_handle = unsafe {
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
        assert_ne!(pipe_handle, INVALID_HANDLE_VALUE);

        // Attempting to connect as client should be rejected with ACCESS_DENIED
        let client_res = unsafe {
            CreateFileW(
                &pipe_name_w,
                FILE_GENERIC_READ.0 | FILE_GENERIC_WRITE.0,
                FILE_SHARE_NONE,
                None,
                OPEN_EXISTING,
                Default::default(),
                None,
            )
        };

        assert!(
            client_res.is_err(),
            "Access to pipe with Deny Everyone DACL must be rejected"
        );

        let _ = unsafe { CloseHandle(pipe_handle) };
        if !sec_desc.0.is_null() {
            let _ = unsafe {
                windows::Win32::Foundation::LocalFree(Some(windows::Win32::Foundation::HLOCAL(
                    sec_desc.0,
                )))
            };
        }
    }

    #[cfg(windows)]
    #[test]
    fn test_client_abrupt_disconnect_handled_safely() {
        use windows::Win32::Storage::FileSystem::{
            CreateFileW, WriteFile, FILE_GENERIC_READ, FILE_GENERIC_WRITE, FILE_SHARE_NONE,
            OPEN_EXISTING,
        };

        let pipe_name = format!(r"\\.\pipe\xyeena-abrupt-pipe-{}", std::process::id());
        let pipe_name_clone = pipe_name.clone();

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
                let _ = frame_buf.extend(&buf[..read as usize]);
                // Client abruptly disconnected before newline delimiter was sent
                assert!(frame_buf.next_frame().unwrap().is_none());
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

        let pipe_w = HSTRING::from(&pipe_name);
        let mut client_h = INVALID_HANDLE_VALUE;
        for _ in 0..50 {
            let h = unsafe {
                CreateFileW(
                    &pipe_w,
                    FILE_GENERIC_READ.0 | FILE_GENERIC_WRITE.0,
                    FILE_SHARE_NONE,
                    None,
                    OPEN_EXISTING,
                    Default::default(),
                    None,
                )
            };
            if let Ok(handle) = h {
                if handle != INVALID_HANDLE_VALUE {
                    client_h = handle;
                    break;
                }
            }
            thread::sleep(std::time::Duration::from_millis(20));
        }
        assert_ne!(
            client_h, INVALID_HANDLE_VALUE,
            "Client connect must succeed"
        );

        // Send partial bytes without newline delimiter
        let partial_data = b"{\"event\": \"Incomplete";
        let mut written = 0u32;
        let _ = unsafe { WriteFile(client_h, Some(partial_data), Some(&mut written), None) };

        // Abruptly close handle
        let _ = unsafe { CloseHandle(client_h) };

        // Listener must exit cleanly without hanging
        listener.join().expect("listener must join cleanly");
    }

    #[test]
    fn test_pipe_sddl_builder() {
        assert_eq!(
            build_pipe_sddl(Some("S-1-5-21-123456789-1001")),
            "D:P(A;;GRGW;;;S-1-5-21-123456789-1001)"
        );
        assert_eq!(build_pipe_sddl(None), "D:P(A;;GRGW;;;OW)");
    }

    #[test]
    fn test_frame_buffer_fuzz_malformed_inputs() {
        let mut fb = FrameBuffer::new();
        // Fuzz 500 arbitrary byte patterns: must never panic or enter infinite loops
        for i in 0..500 {
            let fuzz_len = (i * 37) % 256;
            let mut pattern = Vec::with_capacity(fuzz_len);
            for j in 0..fuzz_len {
                pattern.push(((i * 17 + j * 31) & 0xFF) as u8);
            }
            // Occasionally inject newline
            if i % 5 == 0 && !pattern.is_empty() {
                pattern[fuzz_len / 2] = b'\n';
            }
            let _ = fb.extend(&pattern);
            while let Ok(Some(_)) = fb.next_frame() {}
        }
    }
}
