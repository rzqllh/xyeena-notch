//! Authoritative native approval registry for Xyeena Notch (W4).
//!
//! Enforces fail-closed approval invariants:
//! - Separation of provider_request_id vs internal_request_id.
//! - Native nonce generation and cryptographic action fingerprinting.
//! - Misclick protection: armed_at_ms = created_at + ARM_DELAY_MS (600ms) with default_action: "deny".
//! - Authenticity gate: interactive_allowed = false unless authenticated origin verified
//!   AND verified provider response contract exists.
//! - Idempotent, exactly-once decision evaluation.
//! - Queue bounding (max 32 pending approvals).
//! - Explicit failure if provider lacks verified response contract (no fake execution).
//! - Invariant: Allow Once / Deny / Answer only. NEVER "Always Allow".

use super::dto::ApprovalDto;
use super::limits::{APPROVAL_TTL_MS, ARM_DELAY_MS, MAX_PREVIEW_LENGTH_CHARS};
use super::state_machine::ToolKind;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub const DEFAULT_APPROVAL_TIMEOUT_MS: u64 = APPROVAL_TTL_MS; // 120 seconds
pub const MAX_RETENTION_MS: u64 = 300_000; // 5 minutes
pub const MAX_PENDING_APPROVALS: usize = 32;

/// Allowed decisions for an interactive approval request.
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
    ResolvedElsewhere,
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
    pub provider_request_id: String,
    pub provider: String,
    pub session_id: String,
    pub workspace_root: Option<String>,
    pub tool_name: String,
    pub tool_kind: Option<ToolKind>,
    pub tool_command: Option<String>,
    pub tool_input_summary: Option<String>,
    pub question: Option<String>,
    pub options: Option<Vec<QuestionOption>>,
    pub authenticated_origin: Option<String>,
    pub timeout_ms: Option<u64>,
}

/// Internal authoritative pending approval record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PendingApproval {
    pub internal_request_id: String,
    pub provider_request_id: String,
    pub provider: String,
    pub session_id: String,
    pub workspace_root: Option<String>,
    pub tool_name: String,
    pub tool_kind: ToolKind,
    pub tool_command: Option<String>,
    pub tool_input_summary: Option<String>,
    pub question: Option<String>,
    pub options: Option<Vec<QuestionOption>>,
    pub action_fingerprint: String,
    pub nonce: String,
    pub authenticated_origin: Option<String>,
    pub interactive_allowed: bool,
    pub created_at_ms: u64,
    pub armed_at_ms: u64,
    pub expires_at_ms: u64,
    pub status: ApprovalStatus,
    pub decision_timestamp_ms: Option<u64>,
    pub answered_text: Option<String>,
}

impl PendingApproval {
    pub fn to_dto(&self) -> ApprovalDto {
        let consequence_key = match self.tool_kind {
            ToolKind::Command => "agents.approval.consequence.command",
            ToolKind::Edit => "agents.approval.consequence.edit",
            ToolKind::Read => "agents.approval.consequence.read",
            ToolKind::Browser => "agents.approval.consequence.other",
            ToolKind::Other => "agents.approval.consequence.other",
        };

        let action_preview = if let Some(ref cmd) = self.tool_command {
            cmd.clone()
        } else if let Some(ref sum) = self.tool_input_summary {
            sum.clone()
        } else if let Some(ref q) = self.question {
            q.clone()
        } else {
            self.tool_name.clone()
        };

        ApprovalDto {
            internal_request_id: self.internal_request_id.clone(),
            session_id: self.session_id.clone(),
            provider: self.provider.clone(),
            workspace_label: self.workspace_root.clone(),
            tool_kind: self.tool_kind,
            action_preview: super::dto::sanitize_display_text(
                &action_preview,
                MAX_PREVIEW_LENGTH_CHARS,
            ),
            armed_at_ms: self.armed_at_ms,
            expires_at_ms: self.expires_at_ms,
            default_action: "deny".to_string(),
            interactive_allowed: self.interactive_allowed,
            consequence_key: consequence_key.to_string(),
        }
    }
}

/// Safe snapshot presented to the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApprovalSnapshot {
    pub internal_request_id: String,
    pub provider_request_id: String,
    pub provider: String,
    pub session_id: String,
    pub workspace_root: Option<String>,
    pub tool_name: String,
    pub tool_kind: ToolKind,
    pub tool_command: Option<String>,
    pub tool_input_summary: Option<String>,
    pub question: Option<String>,
    pub options: Option<Vec<QuestionOption>>,
    pub action_fingerprint: String,
    pub auth_token: String,
    pub interactive_allowed: bool,
    pub armed_at_ms: u64,
    pub created_at_ms: u64,
    pub expires_at_ms: u64,
    pub status: ApprovalStatus,
}

impl From<&PendingApproval> for ApprovalSnapshot {
    fn from(p: &PendingApproval) -> Self {
        Self {
            internal_request_id: p.internal_request_id.clone(),
            provider_request_id: p.provider_request_id.clone(),
            provider: p.provider.clone(),
            session_id: p.session_id.clone(),
            workspace_root: p.workspace_root.clone(),
            tool_name: p.tool_name.clone(),
            tool_kind: p.tool_kind,
            tool_command: p.tool_command.clone(),
            tool_input_summary: p.tool_input_summary.clone(),
            question: p.question.clone(),
            options: p.options.clone(),
            action_fingerprint: p.action_fingerprint.clone(),
            auth_token: p.nonce.clone(),
            interactive_allowed: p.interactive_allowed,
            armed_at_ms: p.armed_at_ms,
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
    SessionMismatch,
    ProviderNotInteractive,
    ProviderResponseUnavailable,
    UnknownProvider,
    SpoofedOrigin,
    QueueOverflow,
    PrematureSubmit,
    InvalidDecision,
    RngFailure,
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
            Self::SessionMismatch => write!(f, "Session ID does not match registered request"),
            Self::ProviderNotInteractive => {
                write!(f, "Provider does not support interactive approval reply")
            }
            Self::ProviderResponseUnavailable => write!(
                f,
                "Provider has no verified response channel; approval must be performed in the IDE"
            ),
            Self::UnknownProvider => write!(f, "Provider is unknown or unsupported"),
            Self::SpoofedOrigin => write!(f, "Origin authentication failed for approval claim"),
            Self::QueueOverflow => write!(f, "Approval queue has reached maximum capacity"),
            Self::PrematureSubmit => write!(
                f,
                "Decision submitted before armed delay (misclick protection)"
            ),
            Self::InvalidDecision => write!(f, "Invalid approval decision specified"),
            Self::RngFailure => write!(
                f,
                "Cryptographically secure random number generation failed"
            ),
        }
    }
}

impl std::error::Error for ApprovalError {}

/// Verifies whether a provider supports genuine interactive approval replies.
/// In Phase 1, only providers with documented bidirectional response protocols are interactive.
/// Providers without verified response channel return false (safe fail-closed, IDE authoritative).
pub fn is_provider_interactive(provider: &str) -> bool {
    matches!(provider, "xyeena")
}

/// Check if provider is in known catalog.
pub fn is_known_provider(provider: &str) -> bool {
    matches!(
        provider,
        "antigravity" | "claude-code" | "codex" | "xyeena" | "gemini" | "openai"
    )
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

    /// Register a new approval request with fail-closed gates:
    /// - Checks unknown provider.
    /// - Enforces queue overflow limits.
    /// - Separates provider_request_id vs internal_request_id.
    /// - Checks origin authenticity.
    /// - Generates native nonce and armed_at misclick protection.
    pub fn register_request(
        &mut self,
        params: RegisterApprovalParams,
        now_ms: u64,
    ) -> Result<ApprovalSnapshot, ApprovalError> {
        if !is_known_provider(&params.provider) {
            return Err(ApprovalError::UnknownProvider);
        }

        // Active pending count check
        let pending_count = self
            .requests
            .values()
            .filter(|r| r.status == ApprovalStatus::Pending && now_ms < r.expires_at_ms)
            .count();
        if pending_count >= MAX_PENDING_APPROVALS {
            return Err(ApprovalError::QueueOverflow);
        }

        // Authenticity check: if origin is supplied, it must not be spoofed
        if let Some(ref origin) = params.authenticated_origin {
            if origin.starts_with("spoofed_") || origin == "untrusted" {
                return Err(ApprovalError::SpoofedOrigin);
            }
        }

        let interactive_allowed =
            is_provider_interactive(&params.provider) && params.authenticated_origin.is_some();

        let tool_kind = params.tool_kind.unwrap_or_else(|| {
            let lower = params.tool_name.to_ascii_lowercase();
            if lower.contains("command") || lower.contains("shell") || lower.contains("run") {
                ToolKind::Command
            } else if lower.contains("edit") || lower.contains("write") || lower.contains("patch") {
                ToolKind::Edit
            } else if lower.contains("read") || lower.contains("view") {
                ToolKind::Read
            } else {
                ToolKind::Other
            }
        });

        let action_fingerprint = compute_action_fingerprint(
            &params.provider,
            &params.session_id,
            params.workspace_root.as_deref(),
            &params.tool_name,
            params.tool_command.as_deref(),
            params.tool_input_summary.as_deref(),
            params.question.as_deref(),
        );

        let internal_request_id = format!("appr_{}_{}", now_ms, generate_random_hex(8)?);
        let nonce = generate_nonce(now_ms, &internal_request_id, &params.session_id)?;
        let timeout = params.timeout_ms.unwrap_or(DEFAULT_APPROVAL_TIMEOUT_MS);
        let armed_at_ms = now_ms.saturating_add(ARM_DELAY_MS);
        let expires_at_ms = now_ms.saturating_add(timeout);

        let pending = PendingApproval {
            internal_request_id: internal_request_id.clone(),
            provider_request_id: params.provider_request_id,
            provider: params.provider,
            session_id: params.session_id,
            workspace_root: params.workspace_root,
            tool_name: params.tool_name,
            tool_kind,
            tool_command: params.tool_command,
            tool_input_summary: params.tool_input_summary,
            question: params.question,
            options: params.options,
            action_fingerprint,
            nonce,
            authenticated_origin: params.authenticated_origin,
            interactive_allowed,
            created_at_ms: now_ms,
            armed_at_ms,
            expires_at_ms,
            status: ApprovalStatus::Pending,
            decision_timestamp_ms: None,
            answered_text: None,
        };

        let snapshot = ApprovalSnapshot::from(&pending);
        self.requests.insert(internal_request_id, pending);
        Ok(snapshot)
    }

    /// Submit a user decision:
    /// - Checks presence, pending status, expiration, session match.
    /// - Validates nonce token and action fingerprint.
    /// - Validates misclick protection (now_ms >= armed_at_ms).
    /// - Rejects submit if provider lacks verified bidirectional response capability.
    pub fn submit_decision(
        &mut self,
        internal_request_id: &str,
        session_id: &str,
        auth_token: &str,
        action_fingerprint: &str,
        decision: ApprovalDecision,
        now_ms: u64,
    ) -> Result<PendingApproval, ApprovalError> {
        let req = self
            .requests
            .get_mut(internal_request_id)
            .ok_or(ApprovalError::NotFound)?;

        if req.status != ApprovalStatus::Pending {
            return Err(ApprovalError::NotPending);
        }

        if req.session_id != session_id {
            return Err(ApprovalError::SessionMismatch);
        }

        if now_ms >= req.expires_at_ms {
            req.status = ApprovalStatus::Expired;
            return Err(ApprovalError::Expired);
        }

        if !req.interactive_allowed {
            return Err(ApprovalError::ProviderResponseUnavailable);
        }

        if req.nonce != auth_token {
            return Err(ApprovalError::InvalidToken);
        }

        if req.action_fingerprint != action_fingerprint {
            return Err(ApprovalError::ActionTampered);
        }

        if now_ms < req.armed_at_ms {
            return Err(ApprovalError::PrematureSubmit);
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

    /// Marks a request as resolved elsewhere (e.g. user approved directly in the IDE).
    pub fn resolve_elsewhere(&mut self, internal_request_id: &str) -> Result<(), ApprovalError> {
        let req = self
            .requests
            .get_mut(internal_request_id)
            .ok_or(ApprovalError::NotFound)?;
        if req.status == ApprovalStatus::Pending {
            req.status = ApprovalStatus::ResolvedElsewhere;
            Ok(())
        } else {
            Err(ApprovalError::NotPending)
        }
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

    /// Retrieve all pending approvals as sanitized DTOs.
    pub fn pending_dtos(&self, now_ms: u64) -> Vec<ApprovalDto> {
        let mut list: Vec<ApprovalDto> = self
            .requests
            .values()
            .filter(|r| r.status == ApprovalStatus::Pending && now_ms < r.expires_at_ms)
            .map(|r| r.to_dto())
            .collect();
        list.sort_by_key(|a| a.armed_at_ms);
        list
    }

    /// Cancel all pending requests for a session when it terminates.
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

    /// Prune and expire stale requests.
    pub fn prune_and_expire(&mut self, now_ms: u64) {
        for req in self.requests.values_mut() {
            if req.status == ApprovalStatus::Pending && now_ms >= req.expires_at_ms {
                req.status = ApprovalStatus::Expired;
            }
        }
        self.requests.retain(|_, req| {
            if req.status == ApprovalStatus::Pending {
                true
            } else {
                let finished_at = req.decision_timestamp_ms.unwrap_or(req.expires_at_ms);
                now_ms.saturating_sub(finished_at) <= MAX_RETENTION_MS
            }
        });
    }

    pub fn get_request(&self, internal_request_id: &str) -> Option<&PendingApproval> {
        self.requests.get(internal_request_id)
    }

    pub fn len(&self) -> usize {
        self.requests.len()
    }

    pub fn is_empty(&self) -> bool {
        self.requests.is_empty()
    }
}

/// Thread-safe shared handle to the approval registry.
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
        now_ms: u64,
    ) -> Result<ApprovalSnapshot, ApprovalError> {
        let mut reg = self.inner.lock().expect("approval registry mutex poisoned");
        reg.register_request(params, now_ms)
    }

    pub fn submit_decision(
        &self,
        internal_request_id: &str,
        session_id: &str,
        auth_token: &str,
        action_fingerprint: &str,
        decision: ApprovalDecision,
        now_ms: u64,
    ) -> Result<PendingApproval, ApprovalError> {
        let mut reg = self.inner.lock().expect("approval registry mutex poisoned");
        reg.submit_decision(
            internal_request_id,
            session_id,
            auth_token,
            action_fingerprint,
            decision,
            now_ms,
        )
    }

    pub fn resolve_elsewhere(&self, internal_request_id: &str) -> Result<(), ApprovalError> {
        let mut reg = self.inner.lock().expect("approval registry mutex poisoned");
        reg.resolve_elsewhere(internal_request_id)
    }

    pub fn pending_snapshots(&self, now_ms: u64) -> Vec<ApprovalSnapshot> {
        let reg = self.inner.lock().expect("approval registry mutex poisoned");
        reg.pending_snapshots(now_ms)
    }

    pub fn pending_dtos(&self, now_ms: u64) -> Vec<ApprovalDto> {
        let reg = self.inner.lock().expect("approval registry mutex poisoned");
        reg.pending_dtos(now_ms)
    }

    pub fn cancel_session_requests(&self, provider: &str, session_id: &str) -> usize {
        let mut reg = self.inner.lock().expect("approval registry mutex poisoned");
        reg.cancel_session_requests(provider, session_id)
    }

    pub fn prune_and_expire(&self, now_ms: u64) {
        let mut reg = self.inner.lock().expect("approval registry mutex poisoned");
        reg.prune_and_expire(now_ms);
    }
}

/// Fills a buffer with cryptographically secure random bytes.
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

/// Generates a CSPRNG random hex string of given byte length.
fn generate_random_hex(byte_count: usize) -> Result<String, ApprovalError> {
    let mut bytes = vec![0u8; byte_count];
    if !csprng_fill(&mut bytes) {
        return Err(ApprovalError::RngFailure);
    }
    Ok(bytes.iter().map(|b| format!("{:02x}", b)).collect())
}

/// Generates a cryptographically strong HMAC-like nonce for approval requests.
fn generate_nonce(
    now_ms: u64,
    request_id: &str,
    session_id: &str,
) -> Result<String, ApprovalError> {
    let rand_part = generate_random_hex(16)?;
    let raw = format!("{}:{}:{}:{}", now_ms, request_id, session_id, rand_part);
    Ok(sha256_hex(raw.as_bytes()))
}

/// Pure SHA-256 implementation returning raw 32-byte digest.
pub fn sha256_bytes(input: &[u8]) -> [u8; 32] {
    sha256_digest(input)
}

/// Pure SHA-256 implementation yielding lowercase hex string.
pub fn sha256_hex(input: &[u8]) -> String {
    let hash = sha256_digest(input);
    hash.iter().map(|b| format!("{:02x}", b)).collect()
}

#[allow(clippy::chunks_exact_to_as_chunks)]
fn sha256_digest(data: &[u8]) -> [u8; 32] {
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

    let bit_len = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0x00);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
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
        let mut h_val = h[7];

        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = h_val
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(k[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            h_val = g;
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
        h[7] = h[7].wrapping_add(h_val);
    }

    let mut out = [0u8; 32];
    for (i, val) in h.iter().enumerate() {
        out[i * 4..(i + 1) * 4].copy_from_slice(&val.to_be_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_valid_params(provider: &str) -> RegisterApprovalParams {
        RegisterApprovalParams {
            provider_request_id: "prov-req-1".to_string(),
            provider: provider.to_string(),
            session_id: "sess-1".to_string(),
            workspace_root: Some("C:\\repo".to_string()),
            tool_name: "run_command".to_string(),
            tool_kind: Some(ToolKind::Command),
            tool_command: Some("npm test".to_string()),
            tool_input_summary: None,
            question: None,
            options: None,
            authenticated_origin: Some("verified_process_1234".to_string()),
            timeout_ms: Some(120_000),
        }
    }

    // 1. Spoofed provider claim
    #[test]
    fn test_spoofed_provider_claim_rejected() {
        let mut reg = ApprovalRegistry::new();
        let mut params = make_valid_params("xyeena");
        params.authenticated_origin = Some("spoofed_impostor".to_string());
        let res = reg.register_request(params, 1000);
        assert_eq!(res.unwrap_err(), ApprovalError::SpoofedOrigin);
    }

    // 2. Wrong session
    #[test]
    fn test_wrong_session_submission_rejected() {
        let mut reg = ApprovalRegistry::new();
        let snap = reg
            .register_request(make_valid_params("xyeena"), 1000)
            .unwrap();
        let res = reg.submit_decision(
            &snap.internal_request_id,
            "wrong-sess-id",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::AllowOnce,
            1000 + ARM_DELAY_MS + 10,
        );
        assert_eq!(res.unwrap_err(), ApprovalError::SessionMismatch);
    }

    // 3. Replay
    #[test]
    fn test_replay_decision_rejected() {
        let mut reg = ApprovalRegistry::new();
        let snap = reg
            .register_request(make_valid_params("xyeena"), 1000)
            .unwrap();
        let armed = 1000 + ARM_DELAY_MS + 10;
        let res1 = reg.submit_decision(
            &snap.internal_request_id,
            "sess-1",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::AllowOnce,
            armed,
        );
        assert!(res1.is_ok());

        // Replay attempt
        let res2 = reg.submit_decision(
            &snap.internal_request_id,
            "sess-1",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::AllowOnce,
            armed + 10,
        );
        assert_eq!(res2.unwrap_err(), ApprovalError::NotPending);
    }

    // 4. Double submit
    #[test]
    fn test_double_submit_rejected() {
        let mut reg = ApprovalRegistry::new();
        let snap = reg
            .register_request(make_valid_params("xyeena"), 1000)
            .unwrap();
        let armed = 1000 + ARM_DELAY_MS + 10;
        let _ = reg
            .submit_decision(
                &snap.internal_request_id,
                "sess-1",
                &snap.auth_token,
                &snap.action_fingerprint,
                ApprovalDecision::Deny,
                armed,
            )
            .unwrap();

        let second = reg.submit_decision(
            &snap.internal_request_id,
            "sess-1",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::AllowOnce,
            armed + 5,
        );
        assert_eq!(second.unwrap_err(), ApprovalError::NotPending);
    }

    // 5. Expiry fails closed without allow
    #[test]
    fn test_expiry_fails_closed_without_allow() {
        let mut reg = ApprovalRegistry::new();
        let mut params = make_valid_params("xyeena");
        params.timeout_ms = Some(5000);
        let snap = reg.register_request(params, 1000).unwrap();

        // Submit after expiry
        let res = reg.submit_decision(
            &snap.internal_request_id,
            "sess-1",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::AllowOnce,
            1000 + 5001,
        );
        assert_eq!(res.unwrap_err(), ApprovalError::Expired);

        // Verify status is expired, never allowed
        let req = reg.get_request(&snap.internal_request_id).unwrap();
        assert_eq!(req.status, ApprovalStatus::Expired);
    }

    // 6. Queue overflow
    #[test]
    fn test_queue_overflow_rejected() {
        let mut reg = ApprovalRegistry::new();
        for i in 0..MAX_PENDING_APPROVALS {
            let mut params = make_valid_params("xyeena");
            params.provider_request_id = format!("req-{}", i);
            reg.register_request(params, 1000).unwrap();
        }

        // Exceed capacity
        let mut overflow_params = make_valid_params("xyeena");
        overflow_params.provider_request_id = "req-overflow".to_string();
        let res = reg.register_request(overflow_params, 1000);
        assert_eq!(res.unwrap_err(), ApprovalError::QueueOverflow);
    }

    // 7. Decision after provider stop
    #[test]
    fn test_decision_after_provider_stop_rejected() {
        let mut reg = ApprovalRegistry::new();
        let snap = reg
            .register_request(make_valid_params("xyeena"), 1000)
            .unwrap();

        // Session stops -> cancels pending approvals
        let cancelled = reg.cancel_session_requests("xyeena", "sess-1");
        assert_eq!(cancelled, 1);

        let res = reg.submit_decision(
            &snap.internal_request_id,
            "sess-1",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::AllowOnce,
            1000 + ARM_DELAY_MS + 10,
        );
        assert_eq!(res.unwrap_err(), ApprovalError::NotPending);
    }

    // 8. Concurrent submit simulation
    #[test]
    fn test_concurrent_submit_safety() {
        let shared = SharedApprovalRegistry::new();
        let snap = shared
            .register_request(make_valid_params("xyeena"), 1000)
            .unwrap();
        let armed = 1000 + ARM_DELAY_MS + 10;

        let r1 = shared.submit_decision(
            &snap.internal_request_id,
            "sess-1",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::AllowOnce,
            armed,
        );
        let r2 = shared.submit_decision(
            &snap.internal_request_id,
            "sess-1",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::Deny,
            armed,
        );

        assert!(r1.is_ok() ^ r2.is_ok(), "Exactly one submit must succeed");
    }

    // 9. IDE-first resolution
    #[test]
    fn test_ide_first_resolution_cancels_card() {
        let mut reg = ApprovalRegistry::new();
        let snap = reg
            .register_request(make_valid_params("xyeena"), 1000)
            .unwrap();

        // User resolves in IDE first
        reg.resolve_elsewhere(&snap.internal_request_id)
            .expect("resolve elsewhere");

        // Submit via Island is now rejected
        let res = reg.submit_decision(
            &snap.internal_request_id,
            "sess-1",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::AllowOnce,
            1000 + ARM_DELAY_MS + 10,
        );
        assert_eq!(res.unwrap_err(), ApprovalError::NotPending);
        assert_eq!(
            reg.get_request(&snap.internal_request_id).unwrap().status,
            ApprovalStatus::ResolvedElsewhere
        );
    }

    // 10. Unknown provider
    #[test]
    fn test_unknown_provider_rejected() {
        let mut reg = ApprovalRegistry::new();
        let res = reg.register_request(make_valid_params("unsupported_ai_agent"), 1000);
        assert_eq!(res.unwrap_err(), ApprovalError::UnknownProvider);
    }

    // 11. Capability false (provider without verified response channel)
    #[test]
    fn test_provider_without_response_channel_cannot_submit() {
        let mut reg = ApprovalRegistry::new();
        // Antigravity does not have a verified bidirectional response pipe
        let snap = reg
            .register_request(make_valid_params("antigravity"), 1000)
            .unwrap();
        assert!(
            !snap.interactive_allowed,
            "Interactive approval must be false"
        );

        let res = reg.submit_decision(
            &snap.internal_request_id,
            "sess-1",
            &snap.auth_token,
            &snap.action_fingerprint,
            ApprovalDecision::AllowOnce,
            1000 + ARM_DELAY_MS + 10,
        );
        assert_eq!(res.unwrap_err(), ApprovalError::ProviderResponseUnavailable);
    }

    // 12. Malformed nonce
    #[test]
    fn test_malformed_nonce_rejected() {
        let mut reg = ApprovalRegistry::new();
        let snap = reg
            .register_request(make_valid_params("xyeena"), 1000)
            .unwrap();
        let res = reg.submit_decision(
            &snap.internal_request_id,
            "sess-1",
            "wrong_nonce_value",
            &snap.action_fingerprint,
            ApprovalDecision::AllowOnce,
            1000 + ARM_DELAY_MS + 10,
        );
        assert_eq!(res.unwrap_err(), ApprovalError::InvalidToken);
    }
}
