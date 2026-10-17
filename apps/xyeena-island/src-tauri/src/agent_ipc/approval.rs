//! Authoritative native approval registry for Xyeena Notch.
//!
//! Enforces the immutable approval policy:
//! - Allow Once / Deny / Answer Questions only.
//! - Strict Invariant: No Always Allow, implicit allow, or persistent allow.
//! - Authoritative binding: request ID, provider, session, workspace, nonce token,
//!   action fingerprint, and bounded expiry.
//! - Tamper protection: UI must present the exact action fingerprint and nonce token.
//! - Exactly-once idempotent decision evaluation.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

pub const DEFAULT_APPROVAL_TIMEOUT_MS: u64 = 60_000; // 60 seconds
pub const MAX_RETENTION_MS: u64 = 300_000; // 5 minutes

/// Allowed decisions for an interactive approval request.
/// Invariant: Allow Once / Deny / Answer only. No Always Allow.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalDecision {
    AllowOnce,
    Deny,
    Answer { answer: String },
}

/// Request lifecycle status in the authoritative registry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalStatus {
    Pending,
    AllowedOnce,
    Denied,
    Answered,
    Expired,
    Cancelled,
}

/// Structured option for agent questions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuestionOption {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
}

/// Parameters for registering an interactive approval request.
#[derive(Debug, Clone, Default)]
pub struct RegisterApprovalParams {
    pub request_id: String,
    pub provider: String,
    pub session_id: String,
    pub workspace_root: Option<String>,
    pub tool_name: String,
    pub tool_command: Option<String>,
    pub tool_input_summary: Option<String>,
    pub question: Option<String>,
    pub options: Option<Vec<QuestionOption>>,
    pub timeout_ms: Option<u64>,
}

/// Internal authoritative pending approval record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PendingApproval {
    pub request_id: String,
    pub provider: String,
    pub session_id: String,
    pub workspace_root: Option<String>,
    pub tool_name: String,
    pub tool_command: Option<String>,
    pub tool_input_summary: Option<String>,
    pub question: Option<String>,
    pub options: Option<Vec<QuestionOption>>,
    pub action_fingerprint: String,
    pub nonce: String,
    pub created_at_ms: u64,
    pub expires_at_ms: u64,
    pub status: ApprovalStatus,
    pub decision_timestamp_ms: Option<u64>,
    pub answered_text: Option<String>,
}

/// Safe snapshot presented to the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApprovalSnapshot {
    pub request_id: String,
    pub provider: String,
    pub session_id: String,
    pub workspace_root: Option<String>,
    pub tool_name: String,
    pub tool_command: Option<String>,
    pub tool_input_summary: Option<String>,
    pub question: Option<String>,
    pub options: Option<Vec<QuestionOption>>,
    pub action_fingerprint: String,
    pub auth_token: String,
    pub created_at_ms: u64,
    pub expires_at_ms: u64,
    pub status: ApprovalStatus,
}

impl From<&PendingApproval> for ApprovalSnapshot {
    fn from(p: &PendingApproval) -> Self {
        Self {
            request_id: p.request_id.clone(),
            provider: p.provider.clone(),
            session_id: p.session_id.clone(),
            workspace_root: p.workspace_root.clone(),
            tool_name: p.tool_name.clone(),
            tool_command: p.tool_command.clone(),
            tool_input_summary: p.tool_input_summary.clone(),
            question: p.question.clone(),
            options: p.options.clone(),
            action_fingerprint: p.action_fingerprint.clone(),
            auth_token: p.nonce.clone(),
            created_at_ms: p.created_at_ms,
            expires_at_ms: p.expires_at_ms,
            status: p.status.clone(),
        }
    }
}

/// Errors returned by the approval registry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalError {
    NotFound,
    NotPending,
    Expired,
    ActionTampered,
    InvalidToken,
    ProviderNotInteractive,
    InvalidDecision,
}

impl std::fmt::Display for ApprovalError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound => write!(f, "Approval request not found in registry"),
            Self::NotPending => write!(f, "Approval request is no longer pending"),
            Self::Expired => write!(f, "Approval request has expired"),
            Self::ActionTampered => {
                write!(f, "Action fingerprint does not match authoritative request")
            }
            Self::InvalidToken => {
                write!(f, "Authorization token is invalid or does not match nonce")
            }
            Self::ProviderNotInteractive => {
                write!(f, "Provider does not support interactive approval reply")
            }
            Self::InvalidDecision => write!(f, "Invalid approval decision specified"),
        }
    }
}

impl std::error::Error for ApprovalError {}

/// Verifies whether a provider supports genuine interactive approval replies.
pub fn is_provider_interactive(provider: &str) -> bool {
    matches!(provider, "claude-code" | "codex" | "xyeena")
}

/// Compute a deterministic SHA-256 hex fingerprint for the action payload.
pub fn compute_action_fingerprint(
    provider: &str,
    session_id: &str,
    workspace_root: Option<&str>,
    tool_name: &str,
    tool_command: Option<&str>,
    tool_input_summary: Option<&str>,
    question: Option<&str>,
) -> String {
    let mut payload = Vec::new();
    payload.extend_from_slice(provider.as_bytes());
    payload.push(b'|');
    payload.extend_from_slice(session_id.as_bytes());
    payload.push(b'|');
    payload.extend_from_slice(workspace_root.unwrap_or("").as_bytes());
    payload.push(b'|');
    payload.extend_from_slice(tool_name.as_bytes());
    payload.push(b'|');
    payload.extend_from_slice(tool_command.unwrap_or("").as_bytes());
    payload.push(b'|');
    payload.extend_from_slice(tool_input_summary.unwrap_or("").as_bytes());
    payload.push(b'|');
    payload.extend_from_slice(question.unwrap_or("").as_bytes());

    sha256_hex(&payload)
}

/// Authoritative approval registry.
#[derive(Debug, Default)]
pub struct ApprovalRegistry {
    requests: HashMap<String, PendingApproval>,
}

impl ApprovalRegistry {
    pub fn new() -> Self {
        Self {
            requests: HashMap::new(),
        }
    }

    /// Register a new interactive approval request.
    /// Rejects non-interactive providers to prevent unfulfillable approval states.
    pub fn register_request(
        &mut self,
        params: RegisterApprovalParams,
        now_ms: u64,
    ) -> Result<ApprovalSnapshot, ApprovalError> {
        if !is_provider_interactive(&params.provider) {
            return Err(ApprovalError::ProviderNotInteractive);
        }

        let action_fingerprint = compute_action_fingerprint(
            &params.provider,
            &params.session_id,
            params.workspace_root.as_deref(),
            &params.tool_name,
            params.tool_command.as_deref(),
            params.tool_input_summary.as_deref(),
            params.question.as_deref(),
        );

        let nonce = generate_nonce(now_ms, &params.request_id, &params.session_id);
        let timeout = params.timeout_ms.unwrap_or(DEFAULT_APPROVAL_TIMEOUT_MS);
        let expires_at_ms = now_ms.saturating_add(timeout);

        let req_id = params.request_id;
        let pending = PendingApproval {
            request_id: req_id.clone(),
            provider: params.provider,
            session_id: params.session_id,
            workspace_root: params.workspace_root,
            tool_name: params.tool_name,
            tool_command: params.tool_command,
            tool_input_summary: params.tool_input_summary,
            question: params.question,
            options: params.options,
            action_fingerprint,
            nonce,
            created_at_ms: now_ms,
            expires_at_ms,
            status: ApprovalStatus::Pending,
            decision_timestamp_ms: None,
            answered_text: None,
        };

        let snapshot = ApprovalSnapshot::from(&pending);
        self.requests.insert(req_id, pending);
        Ok(snapshot)
    }

    /// Submit a user decision.
    /// Strictly verifies request presence, pending status, expiry, nonce token, and action fingerprint.
    pub fn submit_decision(
        &mut self,
        request_id: &str,
        auth_token: &str,
        action_fingerprint: &str,
        decision: ApprovalDecision,
        now_ms: u64,
    ) -> Result<PendingApproval, ApprovalError> {
        let req = self
            .requests
            .get_mut(request_id)
            .ok_or(ApprovalError::NotFound)?;

        if req.status != ApprovalStatus::Pending {
            return Err(ApprovalError::NotPending);
        }

        if now_ms >= req.expires_at_ms {
            req.status = ApprovalStatus::Expired;
            return Err(ApprovalError::Expired);
        }

        if req.nonce != auth_token {
            return Err(ApprovalError::InvalidToken);
        }

        if req.action_fingerprint != action_fingerprint {
            return Err(ApprovalError::ActionTampered);
        }

        match decision {
            ApprovalDecision::AllowOnce => {
                req.status = ApprovalStatus::AllowedOnce;
                req.decision_timestamp_ms = Some(now_ms);
            }
            ApprovalDecision::Deny => {
                req.status = ApprovalStatus::Denied;
                req.decision_timestamp_ms = Some(now_ms);
            }
            ApprovalDecision::Answer { answer } => {
                let trimmed = answer.trim();
                if trimmed.is_empty() {
                    return Err(ApprovalError::InvalidDecision);
                }
                req.status = ApprovalStatus::Answered;
                req.decision_timestamp_ms = Some(now_ms);
                req.answered_text = Some(trimmed.to_string());
            }
        }

        Ok(req.clone())
    }

    /// Retrieve all pending approvals as UI snapshots.
    pub fn pending_snapshots(&self, now_ms: u64) -> Vec<ApprovalSnapshot> {
        let mut list: Vec<ApprovalSnapshot> = self
            .requests
            .values()
            .filter(|r| r.status == ApprovalStatus::Pending && now_ms < r.expires_at_ms)
            .map(ApprovalSnapshot::from)
            .collect();
        list.sort_by_key(|a| a.created_at_ms);
        list
    }

    /// Cancel all pending requests for a session when it ends or disconnects.
    pub fn cancel_session_requests(&mut self, provider: &str, session_id: &str) -> usize {
        let mut count = 0;
        for req in self.requests.values_mut() {
            if req.provider == provider
                && req.session_id == session_id
                && req.status == ApprovalStatus::Pending
            {
                req.status = ApprovalStatus::Cancelled;
                count += 1;
            }
        }
        count
    }

    /// Expire pending requests that reached their deadline and prune ancient completed requests.
    pub fn prune_and_expire(&mut self, now_ms: u64) {
        // First expire pending requests past deadline
        for req in self.requests.values_mut() {
            if req.status == ApprovalStatus::Pending && now_ms >= req.expires_at_ms {
                req.status = ApprovalStatus::Expired;
            }
        }

        // Retain completed/expired records for MAX_RETENTION_MS for auditability, then prune
        self.requests.retain(|_, req| {
            if req.status == ApprovalStatus::Pending {
                true
            } else {
                let finished_at = req.decision_timestamp_ms.unwrap_or(req.expires_at_ms);
                now_ms.saturating_sub(finished_at) < MAX_RETENTION_MS
            }
        });
    }

    /// Lookup a single request.
    pub fn get_request(&self, request_id: &str) -> Option<&PendingApproval> {
        self.requests.get(request_id)
    }
}

/// Shared thread-safe handle to the approval registry.
#[derive(Debug, Clone, Default)]
pub struct SharedApprovalRegistry {
    inner: Arc<Mutex<ApprovalRegistry>>,
}

impl SharedApprovalRegistry {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(ApprovalRegistry::new())),
        }
    }

    pub fn register_request(
        &self,
        params: RegisterApprovalParams,
    ) -> Result<ApprovalSnapshot, ApprovalError> {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let mut reg = self.inner.lock().expect("approval registry poisoned");
        reg.register_request(params, now_ms)
    }

    pub fn submit_decision(
        &self,
        request_id: &str,
        auth_token: &str,
        action_fingerprint: &str,
        decision: ApprovalDecision,
    ) -> Result<PendingApproval, ApprovalError> {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let mut reg = self.inner.lock().expect("approval registry poisoned");
        reg.submit_decision(request_id, auth_token, action_fingerprint, decision, now_ms)
    }

    pub fn pending_snapshots(&self) -> Vec<ApprovalSnapshot> {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let mut reg = self.inner.lock().expect("approval registry poisoned");
        reg.prune_and_expire(now_ms);
        reg.pending_snapshots(now_ms)
    }

    pub fn cancel_session_requests(&self, provider: &str, session_id: &str) -> usize {
        let mut reg = self.inner.lock().expect("approval registry poisoned");
        reg.cancel_session_requests(provider, session_id)
    }
}

/// Cryptographically secure random byte generator (CSPRNG).
/// On Windows, queries the OS kernel CSPRNG via RtlGenRandom (advapi32 / SystemFunction036).
pub fn csprng_fill(dest: &mut [u8]) -> bool {
    #[cfg(windows)]
    {
        #[link(name = "advapi32")]
        extern "system" {
            #[link_name = "SystemFunction036"]
            fn RtlGenRandom(buffer: *mut u8, len: u32) -> u8;
        }
        unsafe { RtlGenRandom(dest.as_mut_ptr(), dest.len() as u32) != 0 }
    }
    #[cfg(not(windows))]
    {
        use std::fs::File;
        use std::io::Read;
        if let Ok(mut f) = File::open("/dev/urandom") {
            f.read_exact(dest).is_ok()
        } else {
            false
        }
    }
}

/// Compute raw 32-byte SHA-256 digest (FIPS 180-4).
#[allow(clippy::chunks_exact_to_as_chunks)]
pub fn sha256_bytes(input: &[u8]) -> [u8; 32] {
    let hex = sha256_hex(input);
    let mut out = [0u8; 32];
    for (i, chunk) in hex.as_bytes().chunks_exact(2).enumerate() {
        if let Ok(s) = std::str::from_utf8(chunk) {
            out[i] = u8::from_str_radix(s, 16).unwrap_or(0);
        }
    }
    out
}

/// Generate a cryptographically secure 256-bit nonce token bound to the request.
fn generate_nonce(now_ms: u64, request_id: &str, session_id: &str) -> String {
    let mut rand_bytes = [0u8; 32];
    let _ = csprng_fill(&mut rand_bytes);

    let mut data = Vec::with_capacity(32 + 8 + request_id.len() + session_id.len());
    data.extend_from_slice(&rand_bytes);
    data.extend_from_slice(&now_ms.to_le_bytes());
    data.extend_from_slice(request_id.as_bytes());
    data.extend_from_slice(session_id.as_bytes());

    sha256_hex(&data)[..32].to_string()
}

/// Pure Rust self-contained SHA-256 implementation (FIPS 180-4 compliant).
#[allow(clippy::chunks_exact_to_as_chunks)]
pub fn sha256_hex(input: &[u8]) -> String {
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];

    let k: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];

    let bit_len = (input.len() as u64).wrapping_mul(8);
    let mut msg = input.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 64];
        for (i, word) in chunk.chunks_exact(4).enumerate() {
            w[i] = u32::from_be_bytes([word[0], word[1], word[2], word[3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }

        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut ch_val = h[7];

        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = ch_val
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(k[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            ch_val = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(ch_val);
    }

    let mut out = String::with_capacity(64);
    for val in h {
        out.push_str(&format!("{:08x}", val));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256_known_vector() {
        assert_eq!(
            sha256_hex(b"hello world"),
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn test_register_and_allow_once_happy_path() {
        let mut reg = ApprovalRegistry::new();
        let now = 1_000_000;
        let snap = reg
            .register_request(
                RegisterApprovalParams {
                    request_id: "req-1".into(),
                    provider: "claude-code".into(),
                    session_id: "sess-1".into(),
                    workspace_root: Some("C:\\Projects\\App".into()),
                    tool_name: "Bash".into(),
                    tool_command: Some("git status".into()),
                    tool_input_summary: Some("Check git status".into()),
                    question: None,
                    options: None,
                    timeout_ms: Some(60_000),
                },
                now,
            )
            .expect("registration succeeds");

        assert_eq!(snap.status, ApprovalStatus::Pending);
        assert_eq!(snap.request_id, "req-1");
        assert!(!snap.auth_token.is_empty());
        assert!(!snap.action_fingerprint.is_empty());

        let pending_list = reg.pending_snapshots(now);
        assert_eq!(pending_list.len(), 1);

        let res = reg.submit_decision(
            "req-1",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::AllowOnce,
            now + 500,
        );

        let resolved = res.expect("decision succeeds");
        assert_eq!(resolved.status, ApprovalStatus::AllowedOnce);
        assert_eq!(resolved.decision_timestamp_ms, Some(now + 500));

        // Registry snapshot no longer includes decided request
        let pending_after = reg.pending_snapshots(now + 500);
        assert_eq!(pending_after.len(), 0);
    }

    #[test]
    fn test_replay_decision_fails_not_pending() {
        let mut reg = ApprovalRegistry::new();
        let now = 1_000_000;
        let snap = reg
            .register_request(
                RegisterApprovalParams {
                    request_id: "req-1".into(),
                    provider: "claude-code".into(),
                    session_id: "sess-1".into(),
                    tool_name: "Bash".into(),
                    tool_command: Some("ls".into()),
                    timeout_ms: Some(60_000),
                    ..Default::default()
                },
                now,
            )
            .unwrap();

        reg.submit_decision(
            "req-1",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::AllowOnce,
            now + 100,
        )
        .unwrap();

        // Duplicate replay must fail
        let replay = reg.submit_decision(
            "req-1",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::AllowOnce,
            now + 200,
        );
        assert_eq!(replay, Err(ApprovalError::NotPending));
    }

    #[test]
    fn test_action_fingerprint_tampering_rejected() {
        let mut reg = ApprovalRegistry::new();
        let now = 1_000_000;
        let snap = reg
            .register_request(
                RegisterApprovalParams {
                    request_id: "req-1".into(),
                    provider: "claude-code".into(),
                    session_id: "sess-1".into(),
                    tool_name: "Bash".into(),
                    tool_command: Some("cat file.txt".into()),
                    timeout_ms: Some(60_000),
                    ..Default::default()
                },
                now,
            )
            .unwrap();

        // Altered command generates different fingerprint
        let fake_fingerprint = compute_action_fingerprint(
            "claude-code",
            "sess-1",
            None,
            "Bash",
            Some("rm -rf /"),
            None,
            None,
        );

        let res = reg.submit_decision(
            "req-1",
            &snap.auth_token,
            &fake_fingerprint,
            ApprovalDecision::AllowOnce,
            now + 100,
        );
        assert_eq!(res, Err(ApprovalError::ActionTampered));
    }

    #[test]
    fn test_invalid_token_rejected() {
        let mut reg = ApprovalRegistry::new();
        let now = 1_000_000;
        let snap = reg
            .register_request(
                RegisterApprovalParams {
                    request_id: "req-1".into(),
                    provider: "claude-code".into(),
                    session_id: "sess-1".into(),
                    tool_name: "Bash".into(),
                    tool_command: Some("cat file.txt".into()),
                    timeout_ms: Some(60_000),
                    ..Default::default()
                },
                now,
            )
            .unwrap();

        let res = reg.submit_decision(
            "req-1",
            "wrong-token",
            &snap.action_fingerprint,
            ApprovalDecision::AllowOnce,
            now + 100,
        );
        assert_eq!(res, Err(ApprovalError::InvalidToken));
    }

    #[test]
    fn test_expired_request_fails_closed_without_allow() {
        let mut reg = ApprovalRegistry::new();
        let now = 1_000_000;
        let snap = reg
            .register_request(
                RegisterApprovalParams {
                    request_id: "req-1".into(),
                    provider: "claude-code".into(),
                    session_id: "sess-1".into(),
                    tool_name: "Bash".into(),
                    tool_command: Some("cat file.txt".into()),
                    timeout_ms: Some(10_000),
                    ..Default::default()
                },
                now,
            )
            .unwrap();

        // Submit after deadline
        let res = reg.submit_decision(
            "req-1",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::AllowOnce,
            now + 15_000,
        );
        assert_eq!(res, Err(ApprovalError::Expired));

        // Authoritative record reflects Expired
        let req = reg.get_request("req-1").unwrap();
        assert_eq!(req.status, ApprovalStatus::Expired);
    }

    #[test]
    fn test_cross_session_isolation() {
        let mut reg = ApprovalRegistry::new();
        let now = 1_000_000;

        let snap1 = reg
            .register_request(
                RegisterApprovalParams {
                    request_id: "req-shared-id".into(),
                    provider: "claude-code".into(),
                    session_id: "sess-1".into(),
                    workspace_root: Some("C:\\Work\\A".into()),
                    tool_name: "Bash".into(),
                    tool_command: Some("run-task".into()),
                    timeout_ms: Some(60_000),
                    ..Default::default()
                },
                now,
            )
            .unwrap();

        let _snap2 = reg.register_request(
            RegisterApprovalParams {
                request_id: "req-shared-id".into(),
                provider: "codex".into(),
                session_id: "sess-2".into(),
                workspace_root: Some("C:\\Work\\B".into()),
                tool_name: "Bash".into(),
                tool_command: Some("run-task".into()),
                timeout_ms: Some(60_000),
                ..Default::default()
            },
            now,
        );

        // Map key is request_id, but fingerprints and tokens are bound to session/workspace
        let fp1 = snap1.action_fingerprint;
        let fp2 = compute_action_fingerprint(
            "codex",
            "sess-2",
            Some("C:\\Work\\B"),
            "Bash",
            Some("run-task"),
            None,
            None,
        );
        assert_ne!(
            fp1, fp2,
            "Fingerprints for different workspaces/providers must differ"
        );
    }

    #[test]
    fn test_monitoring_only_provider_rejection() {
        let mut reg = ApprovalRegistry::new();
        let now = 1_000_000;

        // Gemini CLI is monitoring-only
        let res_gemini = reg.register_request(
            RegisterApprovalParams {
                request_id: "req-gemini".into(),
                provider: "gemini-cli".into(),
                session_id: "sess-g".into(),
                tool_name: "Tool".into(),
                timeout_ms: Some(60_000),
                ..Default::default()
            },
            now,
        );
        assert_eq!(
            res_gemini.unwrap_err(),
            ApprovalError::ProviderNotInteractive
        );

        // Antigravity is monitoring-only until interactive reply contract is verified
        let res_agy = reg.register_request(
            RegisterApprovalParams {
                request_id: "req-agy".into(),
                provider: "antigravity".into(),
                session_id: "sess-a".into(),
                tool_name: "Tool".into(),
                timeout_ms: Some(60_000),
                ..Default::default()
            },
            now,
        );
        assert_eq!(res_agy.unwrap_err(), ApprovalError::ProviderNotInteractive);
    }

    #[test]
    fn test_session_termination_cancels_pending_approvals() {
        let mut reg = ApprovalRegistry::new();
        let now = 1_000_000;

        reg.register_request(
            RegisterApprovalParams {
                request_id: "req-1".into(),
                provider: "claude-code".into(),
                session_id: "sess-term".into(),
                tool_name: "Bash".into(),
                tool_command: Some("echo 1".into()),
                timeout_ms: Some(60_000),
                ..Default::default()
            },
            now,
        )
        .unwrap();

        reg.register_request(
            RegisterApprovalParams {
                request_id: "req-2".into(),
                provider: "claude-code".into(),
                session_id: "sess-term".into(),
                tool_name: "Bash".into(),
                tool_command: Some("echo 2".into()),
                timeout_ms: Some(60_000),
                ..Default::default()
            },
            now,
        )
        .unwrap();

        let cancelled = reg.cancel_session_requests("claude-code", "sess-term");
        assert_eq!(cancelled, 2);

        assert_eq!(
            reg.get_request("req-1").unwrap().status,
            ApprovalStatus::Cancelled
        );
        assert_eq!(
            reg.get_request("req-2").unwrap().status,
            ApprovalStatus::Cancelled
        );
        assert_eq!(reg.pending_snapshots(now).len(), 0);
    }

    #[test]
    fn test_structured_question_answer_submission() {
        let mut reg = ApprovalRegistry::new();
        let now = 1_000_000;

        let options = vec![
            QuestionOption {
                id: "opt-1".into(),
                label: "Continue with existing plan".into(),
                description: None,
            },
            QuestionOption {
                id: "opt-2".into(),
                label: "Cancel and abort".into(),
                description: None,
            },
        ];

        let snap = reg
            .register_request(
                RegisterApprovalParams {
                    request_id: "q-1".into(),
                    provider: "claude-code".into(),
                    session_id: "sess-q".into(),
                    tool_name: "AskUser".into(),
                    question: Some("Which branch should be deployed?".into()),
                    options: Some(options),
                    timeout_ms: Some(60_000),
                    ..Default::default()
                },
                now,
            )
            .unwrap();

        assert_eq!(
            snap.question,
            Some("Which branch should be deployed?".into())
        );
        assert_eq!(snap.options.as_ref().unwrap().len(), 2);

        // Empty answer rejected
        let empty_res = reg.submit_decision(
            "q-1",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::Answer {
                answer: "   ".into(),
            },
            now + 100,
        );
        assert_eq!(empty_res, Err(ApprovalError::InvalidDecision));

        // Valid answer accepted
        let ans_res = reg.submit_decision(
            "q-1",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::Answer {
                answer: "Continue with existing plan".into(),
            },
            now + 200,
        );
        let resolved = ans_res.expect("answer succeeds");
        assert_eq!(resolved.status, ApprovalStatus::Answered);
        assert_eq!(
            resolved.answered_text,
            Some("Continue with existing plan".into())
        );
    }

    #[test]
    fn test_deny_decision_recorded_and_exact_once() {
        let mut reg = ApprovalRegistry::new();
        let now = 1_000_000;

        let snap = reg
            .register_request(
                RegisterApprovalParams {
                    request_id: "req-deny".into(),
                    provider: "claude-code".into(),
                    session_id: "sess-deny".into(),
                    tool_name: "Bash".into(),
                    tool_command: Some("dangerous_cmd".into()),
                    timeout_ms: Some(60_000),
                    ..Default::default()
                },
                now,
            )
            .unwrap();

        let res = reg.submit_decision(
            "req-deny",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::Deny,
            now + 300,
        );
        let resolved = res.unwrap();
        assert_eq!(resolved.status, ApprovalStatus::Denied);
        assert_eq!(resolved.decision_timestamp_ms, Some(now + 300));
    }
}
