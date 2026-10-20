//! Integration test for xyeena-agent-relay executable (W8)
//!
//! Validates end-to-end execution of `xyeena-agent-relay.exe` communicating with
//! the local Windows Named Pipe listener.
//! Uses `env!("CARGO_BIN_EXE_xyeena-agent-relay")` guaranteed by Cargo for integration tests.
//! Cites: https://doc.rust-lang.org/cargo/reference/environment-variables.html#environment-variables-cargo-sets-for-crates

#[cfg(windows)]
#[test]
fn test_relay_binary_to_pipe_integration() {
    use std::io::Write;
    use std::process::{Command, Stdio};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration;
    use windows::core::HSTRING;
    use windows::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows::Win32::Security::Authorization::{
        ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
    };
    use windows::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
    use windows::Win32::Storage::FileSystem::{ReadFile, PIPE_ACCESS_DUPLEX};
    use windows::Win32::System::Pipes::{
        ConnectNamedPipe, DisconnectNamedPipe, PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS,
        PIPE_TYPE_BYTE, PIPE_WAIT,
    };
    use xyeena_island_lib::agent_ipc::event::parse_and_normalize;
    use xyeena_island_lib::agent_ipc::framing::FrameBuffer;
    use xyeena_island_lib::agent_ipc::SharedSessionRegistry;

    let relay_exe = env!("CARGO_BIN_EXE_xyeena-agent-relay");
    assert!(
        std::path::Path::new(relay_exe).exists(),
        "Cargo must provide built relay binary at CARGO_BIN_EXE_xyeena-agent-relay: {}",
        relay_exe
    );

    let test_pipe_name = format!(
        r"\\.\pipe\xyeena-integration-test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let test_pipe_clone = test_pipe_name.clone();

    let registry = SharedSessionRegistry::new();
    let registry_clone = registry.clone();
    let done = Arc::new(AtomicBool::new(false));
    let done_clone = Arc::clone(&done);

    let listener = thread::spawn(move || {
        let pipe_w = HSTRING::from(&test_pipe_clone);
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
                &pipe_w,
                PIPE_ACCESS_DUPLEX,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                255,
                65536,
                65536,
                0,
                Some(&sec_attrs),
            )
        };
        if h == INVALID_HANDLE_VALUE {
            return;
        }

        while !done_clone.load(Ordering::SeqCst) {
            let connected = unsafe { ConnectNamedPipe(h, None) };
            let is_connected = connected.is_ok()
                || connected
                    .as_ref()
                    .err()
                    .map(|e| e.code() == windows::Win32::Foundation::WIN32_ERROR(535).to_hresult())
                    .unwrap_or(false);

            if is_connected {
                let mut frame_buf = FrameBuffer::new();
                let mut read_buf = [0u8; 4096];
                let mut read = 0u32;
                let _ = unsafe { ReadFile(h, Some(&mut read_buf), Some(&mut read), None) };
                if read > 0 {
                    let _ = frame_buf.extend(&read_buf[..read as usize]);
                    while let Ok(Some(frame)) = frame_buf.next_frame() {
                        if let Ok(event) = parse_and_normalize(&frame) {
                            let is_target = event.session_id == "session-relay-integration-e2e";
                            registry_clone.handle_event(&event);
                            if is_target {
                                let _ = unsafe { DisconnectNamedPipe(h) };
                                let _ = unsafe { CloseHandle(h) };
                                if !sec_desc.0.is_null() {
                                    let _ = unsafe {
                                        windows::Win32::Foundation::LocalFree(Some(
                                            windows::Win32::Foundation::HLOCAL(sec_desc.0),
                                        ))
                                    };
                                }
                                return;
                            }
                        }
                    }
                }
                let _ = unsafe { DisconnectNamedPipe(h) };
            }
        }
        let _ = unsafe { CloseHandle(h) };
        if !sec_desc.0.is_null() {
            let _ = unsafe {
                windows::Win32::Foundation::LocalFree(Some(windows::Win32::Foundation::HLOCAL(
                    sec_desc.0,
                )))
            };
        }
    });

    thread::sleep(Duration::from_millis(50));

    // Spawn relay using CARGO_BIN_EXE
    let mut child = Command::new(relay_exe)
        .env("XYEENA_AGENT_PIPE_NAME", &test_pipe_name)
        .arg("PostToolUse")
        .arg("--provider")
        .arg("antigravity")
        .arg("--session-id")
        .arg("session-relay-integration-e2e")
        .arg("--check-delivery")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn relay child process via CARGO_BIN_EXE");

    let input_payload = r#"{"tool_name": "read_file", "cwd": "C:\\test\\workspace"}"#;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input_payload.as_bytes());
        drop(stdin);
    }

    let output = child.wait_with_output().expect("wait child");
    done.store(true, Ordering::SeqCst);
    assert!(output.status.success(), "relay exit must be success");

    // Unblock listener if still waiting
    let pipe_w = HSTRING::from(&test_pipe_name);
    unsafe {
        let _ = windows::Win32::Storage::FileSystem::CreateFileW(
            &pipe_w,
            windows::Win32::Storage::FileSystem::FILE_GENERIC_READ.0,
            windows::Win32::Storage::FileSystem::FILE_SHARE_NONE,
            None,
            windows::Win32::Storage::FileSystem::OPEN_EXISTING,
            Default::default(),
            None,
        );
    }

    listener.join().expect("join listener thread");

    let sessions = registry.active_sessions();
    let test_session = sessions
        .iter()
        .find(|s| s.session_id == "session-relay-integration-e2e")
        .expect("session-relay-integration-e2e must be registered in registry");
    assert_eq!(test_session.provider, "antigravity");
}
