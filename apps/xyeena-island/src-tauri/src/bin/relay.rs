//! Native short-lived event relay executable for CLI/IDE agent hooks.
//!
//! Ingests hook events via stdin or CLI flags, bounds payload size, encodes
//! the message frame, and transmits it over the local per-user Windows Named
//! Pipe to Xyeena Island.
//!
//! Design Constraints:
//! - Short-lived, zero-daemon process (< 10ms execution time).
//! - Fail-safe: Exits cleanly with code 0 if Xyeena Island is not running,
//!   never blocking or interrupting agent workflows.
//! - Security: No credential logging, no arbitrary execution.

use std::io::Read;
use xyeena_island_lib::agent_ipc::framing::{encode_frame, MAX_PAYLOAD_SIZE};
use xyeena_island_lib::agent_ipc::get_pipe_name;

#[cfg(windows)]
use windows::core::HSTRING;
#[cfg(windows)]
use windows::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
#[cfg(windows)]
use windows::Win32::Storage::FileSystem::{
    CreateFileW, WriteFile, FILE_GENERIC_READ, FILE_GENERIC_WRITE, FILE_SHARE_NONE, OPEN_EXISTING,
};
#[cfg(windows)]
use windows::Win32::System::Pipes::WaitNamedPipeW;

fn main() {
    // 1. Parse CLI arguments
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut event_type_hint: Option<String> = None;
    let mut provider_hint: Option<String> = None;
    let mut session_id_hint: Option<String> = None;
    let mut check_delivery = false;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--provider" => {
                if i + 1 < args.len() {
                    provider_hint = Some(args[i + 1].clone());
                    i += 2;
                    continue;
                }
            }
            "--session-id" => {
                if i + 1 < args.len() {
                    session_id_hint = Some(args[i + 1].clone());
                    i += 2;
                    continue;
                }
            }
            "--check-delivery" => {
                check_delivery = true;
            }
            arg if !arg.starts_with("--") && event_type_hint.is_none() => {
                event_type_hint = Some(arg.to_string());
            }
            _ => {}
        }
        i += 1;
    }

    // 2. Read bounded payload from stdin (up to 1MB) with multi-chunk accumulation
    let has_event_hint = event_type_hint.is_some();
    let stdin_buf = read_stdin_bounded(has_event_hint);

    let mut payload: serde_json::Value = if !stdin_buf.is_empty() {
        if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&stdin_buf) {
            val
        } else {
            // Stdin was not valid JSON, treat as raw message string if short
            let text = String::from_utf8_lossy(&stdin_buf);
            serde_json::json!({
                "raw_text": text.trim(),
            })
        }
    } else {
        serde_json::json!({})
    };

    // Ensure payload is a JSON object
    if !payload.is_object() {
        payload = serde_json::json!({ "data": payload });
    }

    {
        let obj = payload.as_object_mut().unwrap();

        // Inject hints if missing
        if !obj.contains_key("event")
            && !obj.contains_key("event_type")
            && !obj.contains_key("type")
        {
            if let Some(ref ev) = event_type_hint {
                obj.insert("event".into(), serde_json::Value::String(ev.clone()));
            }
        }
        if !obj.contains_key("provider") && !obj.contains_key("agent") {
            if let Some(ref p) = provider_hint {
                obj.insert("provider".into(), serde_json::Value::String(p.clone()));
            }
        }
        if !obj.contains_key("session_id") && !obj.contains_key("sessionId") {
            if let Some(ref s) = session_id_hint {
                obj.insert("session_id".into(), serde_json::Value::String(s.clone()));
            }
        }

        // Include timestamp if absent
        if !obj.contains_key("timestamp") && !obj.contains_key("timestamp_ms") {
            use std::time::{SystemTime, UNIX_EPOCH};
            if let Ok(duration) = SystemTime::now().duration_since(UNIX_EPOCH) {
                let millis = duration.as_millis() as u64;
                obj.insert("timestamp".into(), serde_json::Value::Number(millis.into()));
            }
        }
    }

    // 3. Encode newline-delimited frame
    let frame = match encode_frame(&payload) {
        Ok(f) => f,
        Err(_) => {
            if check_delivery {
                std::process::exit(1);
            } else {
                print!("{{}}");
                std::process::exit(0);
            }
        }
    };

    // 4. Send over Windows Named Pipe (fail-open)
    #[cfg(windows)]
    let delivered = send_to_pipe(&frame);
    #[cfg(not(windows))]
    let delivered = false;

    if check_delivery && !delivered {
        std::process::exit(1);
    }

    // Output empty JSON object for Antigravity hook command compatibility
    print!("{{}}");
    std::process::exit(0);
}

#[cfg(windows)]
fn send_to_pipe(frame: &[u8]) -> bool {
    let pipe_name = get_pipe_name();
    let pipe_w = HSTRING::from(&pipe_name);

    unsafe {
        // Quick check/connect to pipe
        let mut client_h = CreateFileW(
            &pipe_w,
            FILE_GENERIC_READ.0 | FILE_GENERIC_WRITE.0,
            FILE_SHARE_NONE,
            None,
            OPEN_EXISTING,
            Default::default(),
            None,
        );

        // If pipe was busy, wait up to 50ms once
        if client_h.is_err() {
            let _ = WaitNamedPipeW(&pipe_w, 50);
            client_h = CreateFileW(
                &pipe_w,
                FILE_GENERIC_READ.0 | FILE_GENERIC_WRITE.0,
                FILE_SHARE_NONE,
                None,
                OPEN_EXISTING,
                Default::default(),
                None,
            );
        }

        if let Ok(handle) = client_h {
            if handle != INVALID_HANDLE_VALUE {
                let mut written = 0u32;
                let write_res = WriteFile(handle, Some(frame), Some(&mut written), None);
                let _ = CloseHandle(handle);
                return write_res.is_ok() && written as usize == frame.len();
            }
        }
    }
    false
}

/// Reads bounded payload from stdin without blocking indefinitely.
///
/// Features:
/// - Skips stdin immediately if attached to an interactive terminal.
/// - Ingests multiple stream chunks until a complete valid JSON object is received or EOF.
/// - Enforces a bounded wait deadline (100ms max) and allocation ceiling (MAX_PAYLOAD_SIZE).
#[cfg(windows)]
fn read_stdin_bounded(has_event_hint: bool) -> Vec<u8> {
    use std::io::IsTerminal;
    if std::io::stdin().is_terminal() {
        return Vec::new();
    }

    use std::os::windows::io::AsRawHandle;
    use std::time::{Duration, Instant};
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Storage::FileSystem::{GetFileType, ReadFile, FILE_TYPE_PIPE};
    use windows::Win32::System::Pipes::PeekNamedPipe;

    let stdin = std::io::stdin();
    let raw = stdin.as_raw_handle();
    let handle = HANDLE(raw as _);

    let file_type = unsafe { GetFileType(handle) };
    if file_type == FILE_TYPE_PIPE {
        let deadline = Instant::now() + Duration::from_millis(100);
        let mut buf = Vec::new();
        let mut waited_ms = 0u64;

        while Instant::now() < deadline && buf.len() < MAX_PAYLOAD_SIZE {
            let mut avail = 0u32;
            let peek_res = unsafe { PeekNamedPipe(handle, None, 0, None, Some(&mut avail), None) };
            if peek_res.is_err() {
                // Writer closed pipe or broken -> EOF reached
                break;
            }

            if avail > 0 {
                let to_read = (avail as usize).min(MAX_PAYLOAD_SIZE - buf.len());
                let mut chunk = vec![0u8; to_read];
                let mut actual_read = 0u32;
                let read_res =
                    unsafe { ReadFile(handle, Some(&mut chunk), Some(&mut actual_read), None) };
                if read_res.is_ok() && actual_read > 0 {
                    chunk.truncate(actual_read as usize);
                    buf.extend_from_slice(&chunk);

                    // If we have received a valid complete JSON, return immediately
                    if serde_json::from_slice::<serde_json::Value>(&buf).is_ok() {
                        return buf;
                    }
                } else {
                    break;
                }
            } else {
                if !buf.is_empty() {
                    std::thread::sleep(Duration::from_millis(5));
                    waited_ms += 5;
                    if waited_ms >= 30 {
                        break;
                    }
                } else if has_event_hint && waited_ms >= 100 {
                    return Vec::new();
                } else {
                    std::thread::sleep(Duration::from_millis(5));
                    waited_ms += 5;
                }
            }
        }
        return buf;
    }

    // Disk file or other redirection with EOF
    let mut buf = Vec::new();
    let _ = stdin.take(MAX_PAYLOAD_SIZE as u64).read_to_end(&mut buf);
    buf
}

#[cfg(not(windows))]
fn read_stdin_bounded(_has_event_hint: bool) -> Vec<u8> {
    Vec::new()
}
