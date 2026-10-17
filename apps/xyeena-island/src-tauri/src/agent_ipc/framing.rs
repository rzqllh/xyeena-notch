//! Bounded message framing for agent IPC.
//!
//! Enforces strict message size limits, newline-delimited stream decoding,
//! UTF-8 validation, and structured error reporting.

use std::fmt;

/// Maximum payload size allowed for a single IPC frame (1 MB).
/// Protects against memory exhaustion and denial-of-service from runaway clients.
pub const MAX_PAYLOAD_SIZE: usize = 1024 * 1024;

/// Errors that can occur during frame decoding.
#[derive(Debug, PartialEq, Eq)]
pub enum FramingError {
    /// Frame exceeds the maximum allowed payload size.
    OversizedPayload { size: usize, limit: usize },
    /// Frame contains invalid UTF-8 bytes.
    InvalidUtf8,
    /// Frame payload is not valid JSON.
    MalformedJson(String),
    /// Stream ended before a complete frame delimiter was found.
    IncompleteFrame,
}

impl fmt::Display for FramingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OversizedPayload { size, limit } => {
                write!(
                    f,
                    "Payload size ({size} bytes) exceeds limit ({limit} bytes)"
                )
            }
            Self::InvalidUtf8 => write!(f, "Frame contains invalid UTF-8"),
            Self::MalformedJson(err) => write!(f, "Malformed JSON frame: {err}"),
            Self::IncompleteFrame => write!(f, "Incomplete frame: waiting for delimiter"),
        }
    }
}

impl std::error::Error for FramingError {}

/// Encode a JSON value into a newline-delimited frame.
pub fn encode_frame<T: serde::Serialize>(value: &T) -> Result<Vec<u8>, FramingError> {
    let mut bytes =
        serde_json::to_vec(value).map_err(|e| FramingError::MalformedJson(e.to_string()))?;
    if bytes.len() > MAX_PAYLOAD_SIZE {
        return Err(FramingError::OversizedPayload {
            size: bytes.len(),
            limit: MAX_PAYLOAD_SIZE,
        });
    }
    bytes.push(b'\n');
    Ok(bytes)
}

/// A streaming buffer that extracts newline-delimited frames up to `MAX_PAYLOAD_SIZE`.
#[derive(Debug, Default)]
pub struct FrameBuffer {
    buffer: Vec<u8>,
}

impl FrameBuffer {
    pub fn new() -> Self {
        Self { buffer: Vec::new() }
    }

    /// Append raw bytes read from the transport stream.
    /// Returns an error if the accumulated un-delimited buffer exceeds `MAX_PAYLOAD_SIZE`.
    pub fn extend(&mut self, chunk: &[u8]) -> Result<(), FramingError> {
        self.buffer.extend_from_slice(chunk);
        if self.buffer.len() > MAX_PAYLOAD_SIZE && !self.buffer.contains(&b'\n') {
            let size = self.buffer.len();
            self.buffer.clear();
            return Err(FramingError::OversizedPayload {
                size,
                limit: MAX_PAYLOAD_SIZE,
            });
        }
        Ok(())
    }

    /// Attempt to extract the next complete frame from the buffer.
    /// If a newline is found, extracts and parses the JSON value.
    pub fn next_frame(&mut self) -> Result<Option<serde_json::Value>, FramingError> {
        if let Some(pos) = self.buffer.iter().position(|&b| b == b'\n') {
            if pos > MAX_PAYLOAD_SIZE {
                self.buffer.drain(..=pos);
                return Err(FramingError::OversizedPayload {
                    size: pos,
                    limit: MAX_PAYLOAD_SIZE,
                });
            }
            let frame_bytes: Vec<u8> = self.buffer.drain(..=pos).collect();
            // Drop trailing \r and \n
            let line = frame_bytes.strip_suffix(b"\n").unwrap_or(&frame_bytes);
            let line = line.strip_suffix(b"\r").unwrap_or(line);

            if line.is_empty() {
                return Ok(None);
            }

            let text = std::str::from_utf8(line).map_err(|_| FramingError::InvalidUtf8)?;
            let value: serde_json::Value = serde_json::from_str(text)
                .map_err(|e| FramingError::MalformedJson(e.to_string()))?;
            Ok(Some(value))
        } else {
            Ok(None)
        }
    }

    /// Check if internal buffer is empty.
    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }

    /// Clear internal buffer.
    pub fn clear(&mut self) {
        self.buffer.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_encode_and_decode_single_frame() {
        let payload = json!({
            "event": "SessionStart",
            "provider": "claude-code",
            "session_id": "test-session-1"
        });

        let encoded = encode_frame(&payload).expect("encoding must succeed");
        assert!(encoded.ends_with(b"\n"));

        let mut fb = FrameBuffer::new();
        fb.extend(&encoded).expect("extend must succeed");

        let decoded = fb
            .next_frame()
            .expect("decode must succeed")
            .expect("must yield frame");
        assert_eq!(decoded, payload);
        assert!(fb.is_empty());
    }

    #[test]
    fn test_multiple_concatenated_frames() {
        let msg1 = json!({"id": 1});
        let msg2 = json!({"id": 2});

        let mut data = encode_frame(&msg1).unwrap();
        data.extend_from_slice(&encode_frame(&msg2).unwrap());

        let mut fb = FrameBuffer::new();
        fb.extend(&data).unwrap();

        let f1 = fb.next_frame().unwrap().expect("frame 1");
        assert_eq!(f1["id"], 1);

        let f2 = fb.next_frame().unwrap().expect("frame 2");
        assert_eq!(f2["id"], 2);

        assert!(fb.next_frame().unwrap().is_none());
        assert!(fb.is_empty());
    }

    #[test]
    fn test_partial_chunk_delivery() {
        let msg = json!({"greeting": "hello world", "step": 42});
        let encoded = encode_frame(&msg).unwrap();

        let mut fb = FrameBuffer::new();
        // Feed in two chunks
        let mid = encoded.len() / 2;
        fb.extend(&encoded[..mid]).unwrap();
        assert!(fb.next_frame().unwrap().is_none()); // Not complete yet

        fb.extend(&encoded[mid..]).unwrap();
        let decoded = fb.next_frame().unwrap().expect("must complete now");
        assert_eq!(decoded["greeting"], "hello world");
        assert_eq!(decoded["step"], 42);
    }

    #[test]
    fn test_oversized_payload_rejection() {
        let mut fb = FrameBuffer::new();
        let huge_chunk = vec![b'a'; MAX_PAYLOAD_SIZE + 10];
        let err = fb.extend(&huge_chunk).unwrap_err();
        match err {
            FramingError::OversizedPayload { size, limit } => {
                assert_eq!(limit, MAX_PAYLOAD_SIZE);
                assert!(size > limit);
            }
            _ => panic!("Expected OversizedPayload error, got: {:?}", err),
        }
    }

    #[test]
    fn test_malformed_json_rejection() {
        let mut fb = FrameBuffer::new();
        fb.extend(b"{ invalid json }\n").unwrap();
        let err = fb.next_frame().unwrap_err();
        match err {
            FramingError::MalformedJson(_) => (),
            _ => panic!("Expected MalformedJson error, got: {:?}", err),
        }
    }

    #[test]
    fn test_invalid_utf8_rejection() {
        let mut fb = FrameBuffer::new();
        // 0xFF 0xFE is not valid UTF-8
        fb.extend(&[0xFF, 0xFE, b'\n']).unwrap();
        let err = fb.next_frame().unwrap_err();
        assert_eq!(err, FramingError::InvalidUtf8);
    }
}
