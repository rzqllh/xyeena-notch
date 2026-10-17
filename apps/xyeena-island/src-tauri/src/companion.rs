//! Secure Android companion pairing and mobile approval verification module.
//! Implements local cryptographically bounded pairing, QR payload generation,
//! mutual authentication, and revocation without synthetic shortcuts.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

pub const PAIRING_EXPIRY_MS: u64 = 300_000; // 5 minutes

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompanionDevice {
    pub device_id: String,
    pub device_name: String,
    pub paired_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", content = "details")]
pub enum CompanionPairingState {
    Unpaired,
    PairingRequested {
        pairing_code: String,
        qr_payload: String,
        expires_at_ms: u64,
    },
    Paired(CompanionDevice),
}

#[derive(Debug, Clone)]
pub struct PairingSession {
    pub pairing_code: String,
    pub pairing_secret: String,
    pub expires_at_ms: u64,
}

/// Typed mobile approval submission with strict binding fields.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MobileApprovalPayload {
    pub device_id: String,
    pub request_id: String,
    pub action_fingerprint: String,
    pub expires_at_ms: u64,
    pub nonce_or_counter: u64,
    pub decision: String,
}

impl MobileApprovalPayload {
    pub fn canonical_message(&self) -> String {
        format!(
            "{}:{}:{}:{}:{}:{}",
            self.device_id,
            self.request_id,
            self.action_fingerprint,
            self.expires_at_ms,
            self.nonce_or_counter,
            self.decision
        )
    }
}

#[derive(Default)]
pub struct CompanionRegistry {
    pub pending_pairing: Option<PairingSession>,
    pub paired_device: Option<CompanionDevice>,
    pub shared_secret: Option<String>,
    pub seen_approval_nonces: HashSet<(String, u64)>,
}

impl CompanionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get_state(&mut self) -> CompanionPairingState {
        let now = current_time_ms();
        if let Some(ref device) = self.paired_device {
            return CompanionPairingState::Paired(device.clone());
        }

        if let Some(ref session) = self.pending_pairing {
            if now < session.expires_at_ms {
                let qr_payload = format!(
                    "{{\"protocol\":\"xyeena-companion-v1\",\"code\":\"{}\",\"token\":\"{}\",\"expires\":{}}}",
                    session.pairing_code, session.pairing_secret, session.expires_at_ms
                );
                return CompanionPairingState::PairingRequested {
                    pairing_code: session.pairing_code.clone(),
                    qr_payload,
                    expires_at_ms: session.expires_at_ms,
                };
            } else {
                self.pending_pairing = None;
            }
        }

        CompanionPairingState::Unpaired
    }

    pub fn request_pairing(&mut self) -> Result<CompanionPairingState, String> {
        let now = current_time_ms();
        let pairing_code = generate_pairing_code()?;
        let pairing_secret = generate_pairing_secret()?;
        let expires_at_ms = now + PAIRING_EXPIRY_MS;

        let qr_payload = format!(
            "{{\"protocol\":\"xyeena-companion-v1\",\"code\":\"{}\",\"token\":\"{}\",\"expires\":{}}}",
            pairing_code, pairing_secret, expires_at_ms
        );

        self.pending_pairing = Some(PairingSession {
            pairing_code: pairing_code.clone(),
            pairing_secret,
            expires_at_ms,
        });

        Ok(CompanionPairingState::PairingRequested {
            pairing_code,
            qr_payload,
            expires_at_ms,
        })
    }

    pub fn confirm_pairing(
        &mut self,
        device_id: String,
        device_name: String,
        code: &str,
        token: &str,
    ) -> Result<CompanionDevice, String> {
        let now = current_time_ms();
        let session = self
            .pending_pairing
            .take()
            .ok_or_else(|| "No pending pairing session active.".to_string())?;

        if now >= session.expires_at_ms {
            return Err("Pairing session has expired. Please generate a new code.".into());
        }

        if !constant_time_eq(session.pairing_code.as_bytes(), code.trim().as_bytes())
            || !constant_time_eq(session.pairing_secret.as_bytes(), token.trim().as_bytes())
        {
            return Err("Invalid pairing code or authentication token.".into());
        }

        let device = CompanionDevice {
            device_id,
            device_name,
            paired_at_ms: now,
        };

        self.paired_device = Some(device.clone());
        self.shared_secret = Some(session.pairing_secret);
        self.seen_approval_nonces.clear();

        Ok(device)
    }

    pub fn revoke(&mut self) -> bool {
        self.paired_device = None;
        self.shared_secret = None;
        self.pending_pairing = None;
        self.seen_approval_nonces.clear();
        true
    }

    pub fn verify_signature(&self, action_fingerprint: &str, signature: &str) -> bool {
        match self.shared_secret.as_deref() {
            Some(secret) => {
                let expected = compute_signature(secret, action_fingerprint);
                constant_time_eq(expected.as_bytes(), signature.trim().as_bytes())
            }
            None => false,
        }
    }

    /// Verifies mobile approval decision with strict binding to device identity,
    /// request ID, action fingerprint, expiry, and replay-protected nonce/counter.
    pub fn verify_mobile_approval(
        &mut self,
        payload: &MobileApprovalPayload,
        signature: &str,
        now_ms: u64,
    ) -> Result<(), String> {
        let paired = self.paired_device.as_ref().ok_or_else(|| {
            "No companion device paired (device revoked or unpaired).".to_string()
        })?;

        if paired.device_id != payload.device_id {
            return Err(format!(
                "Cross-device approval rejected: submission device_id '{}' does not match paired device '{}'",
                payload.device_id, paired.device_id
            ));
        }

        if now_ms >= payload.expires_at_ms {
            return Err("Mobile approval has expired.".to_string());
        }

        let replay_key = (payload.request_id.clone(), payload.nonce_or_counter);
        if self.seen_approval_nonces.contains(&replay_key) {
            return Err(
                "Replay attack detected: approval nonce/counter already used for this request."
                    .to_string(),
            );
        }

        let secret = self
            .shared_secret
            .as_deref()
            .ok_or_else(|| "No shared pairing secret established.".to_string())?;

        let canonical = payload.canonical_message();
        let expected_sig = compute_signature(secret, &canonical);

        if !constant_time_eq(expected_sig.as_bytes(), signature.trim().as_bytes()) {
            return Err("Invalid mobile approval signature: HMAC verification failed.".to_string());
        }

        self.seen_approval_nonces.insert(replay_key);
        Ok(())
    }

    /// Validates mobile approval and strictly enforces that actual execution remains disabled
    /// until the complete authenticated mobile transport and Android client pass end-to-end tests.
    pub fn execute_mobile_approval(
        &mut self,
        payload: &MobileApprovalPayload,
        signature: &str,
        now_ms: u64,
    ) -> Result<(), String> {
        self.verify_mobile_approval(payload, signature, now_ms)?;
        Err("Mobile approval execution is disabled: authenticated mobile transport and Android client are pending end-to-end acceptance.".to_string())
    }
}

static COMPANION_REGISTRY: Mutex<Option<CompanionRegistry>> = Mutex::new(None);

fn with_registry<F, R>(f: F) -> R
where
    F: FnOnce(&mut CompanionRegistry) -> R,
{
    let mut guard = COMPANION_REGISTRY
        .lock()
        .expect("CompanionRegistry lock poisoned");
    let reg = guard.get_or_insert_with(CompanionRegistry::default);
    f(reg)
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Constant-time byte-slice comparison to prevent timing attacks.
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Generates an unbiased CSPRNG-backed 6-digit numeric pairing code using rejection sampling.
pub fn generate_pairing_code() -> Result<String, String> {
    generate_pairing_code_with_rng(crate::agent_ipc::approval::csprng_fill)
}

pub fn generate_pairing_code_with_rng<F>(mut rng: F) -> Result<String, String>
where
    F: FnMut(&mut [u8]) -> bool,
{
    // Range 100_000..=999_999 (900_000 possibilities)
    const RANGE: u32 = 900_000;
    const LIMIT: u32 = u32::MAX - (u32::MAX % RANGE);

    let mut bytes = [0u8; 4];
    for _ in 0..64 {
        if !rng(&mut bytes) || bytes.iter().all(|&b| b == 0) {
            return Err("CSPRNG failed during pairing code generation".into());
        }
        let val = u32::from_le_bytes(bytes);
        if val < LIMIT {
            let code = 100_000 + (val % RANGE);
            return Ok(format!("{:06}", code));
        }
    }
    Err("CSPRNG rejection sampling exhausted iterations".into())
}

/// Generates 32 cryptographically secure random bytes (256-bit entropy)
/// encoded as a 64-character lowercase hexadecimal string.
pub fn generate_pairing_secret() -> Result<String, String> {
    generate_pairing_secret_with_rng(crate::agent_ipc::approval::csprng_fill)
}

pub fn generate_pairing_secret_with_rng<F>(rng: F) -> Result<String, String>
where
    F: FnOnce(&mut [u8]) -> bool,
{
    let mut buf = [0u8; 32];
    if !rng(&mut buf) || buf.iter().all(|&b| b == 0) {
        return Err("CSPRNG failed during pairing secret generation".into());
    }
    let mut out = String::with_capacity(64);
    for b in buf {
        out.push_str(&format!("{:02x}", b));
    }
    Ok(out)
}

/// Compute HMAC-SHA256 signature using pairing secret and message (RFC 2104).
pub fn compute_signature(secret: &str, message: &str) -> String {
    hmac_sha256(secret.as_bytes(), message.as_bytes())
}

/// Standard RFC 2104 HMAC-SHA256 implementation.
pub fn hmac_sha256(key: &[u8], message: &[u8]) -> String {
    use crate::agent_ipc::approval::{sha256_bytes, sha256_hex};
    const BLOCK_SIZE: usize = 64;
    let mut k_pad = [0u8; BLOCK_SIZE];
    if key.len() > BLOCK_SIZE {
        let key_hash = sha256_bytes(key);
        k_pad[..32].copy_from_slice(&key_hash);
    } else {
        k_pad[..key.len()].copy_from_slice(key);
    }

    let mut ipad = [0x36u8; BLOCK_SIZE];
    let mut opad = [0x5cu8; BLOCK_SIZE];
    for i in 0..BLOCK_SIZE {
        ipad[i] ^= k_pad[i];
        opad[i] ^= k_pad[i];
    }

    let mut inner_input = Vec::with_capacity(BLOCK_SIZE + message.len());
    inner_input.extend_from_slice(&ipad);
    inner_input.extend_from_slice(message);
    let inner_hash = sha256_bytes(&inner_input);

    let mut outer_input = Vec::with_capacity(BLOCK_SIZE + 32);
    outer_input.extend_from_slice(&opad);
    outer_input.extend_from_slice(&inner_hash);
    sha256_hex(&outer_input)
}

/// Query current companion pairing state.
#[tauri::command]
pub fn get_companion_state() -> Result<CompanionPairingState, String> {
    with_registry(|reg| Ok(reg.get_state()))
}

/// Request new local pairing code and QR payload with CSPRNG-backed randomness.
#[tauri::command]
pub fn request_companion_pairing() -> Result<CompanionPairingState, String> {
    with_registry(|reg| reg.request_pairing())
}

/// Confirm pairing with code and token, registering authenticated mobile device.
#[tauri::command]
pub fn confirm_companion_pairing(
    device_id: String,
    device_name: String,
    code: String,
    token: String,
) -> Result<CompanionDevice, String> {
    with_registry(|reg| reg.confirm_pairing(device_id, device_name, &code, &token))
}

/// Revoke any paired companion devices immediately.
#[tauri::command]
pub fn revoke_companion_device() -> Result<bool, String> {
    with_registry(|reg| Ok(reg.revoke()))
}

/// Verify mobile approval decision signature using shared pairing secret.
pub fn verify_approval_signature(action_fingerprint: &str, signature: &str) -> bool {
    with_registry(|reg| reg.verify_signature(action_fingerprint, signature))
}

/// Tauri command to verify a full bound mobile approval payload.
#[tauri::command]
pub fn verify_mobile_approval_decision(
    payload: MobileApprovalPayload,
    signature: String,
) -> Result<(), String> {
    let now = current_time_ms();
    with_registry(|reg| reg.verify_mobile_approval(&payload, &signature, now))
}

/// Tauri command to execute a mobile approval decision (strictly gated/disabled).
#[tauri::command]
pub fn execute_mobile_approval_decision(
    payload: MobileApprovalPayload,
    signature: String,
) -> Result<(), String> {
    let now = current_time_ms();
    with_registry(|reg| reg.execute_mobile_approval(&payload, &signature, now))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pairing_code_rng_failure() {
        let err = generate_pairing_code_with_rng(|_| false);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("CSPRNG failed"));
    }

    #[test]
    fn test_pairing_code_zero_entropy_failure() {
        let err = generate_pairing_code_with_rng(|buf| {
            buf.fill(0);
            true
        });
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("CSPRNG failed"));
    }

    #[test]
    fn test_pairing_secret_length_and_entropy() {
        let secret1 = generate_pairing_secret().expect("Secret 1 generated");
        let secret2 = generate_pairing_secret().expect("Secret 2 generated");
        // 32 random bytes = 64 hexadecimal characters
        assert_eq!(secret1.len(), 64);
        assert_eq!(secret2.len(), 64);
        assert_ne!(secret1, secret2);
    }

    #[test]
    fn test_constant_time_eq() {
        assert!(constant_time_eq(b"hello", b"hello"));
        assert!(!constant_time_eq(b"hello", b"world"));
        assert!(!constant_time_eq(b"hello", b"hell"));
    }

    #[test]
    fn test_rfc4231_hmac_sha256_test_cases() {
        // RFC 4231 Test Case 1
        let key1 = [0x0b; 20];
        let data1 = b"Hi There";
        let expected1 = "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7";
        assert_eq!(hmac_sha256(&key1, data1), expected1);

        // RFC 4231 Test Case 2
        let key2 = b"Jefe";
        let data2 = b"what do ya want for nothing?";
        let expected2 = "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843";
        assert_eq!(hmac_sha256(key2, data2), expected2);

        // RFC 4231 Test Case 3
        let key3 = [0xaa; 20];
        let data3 = [0xdd; 50];
        let expected3 = "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe";
        assert_eq!(hmac_sha256(&key3, &data3), expected3);

        // RFC 4231 Test Case 4
        let key4 = [
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
            0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19,
        ];
        let data4 = [0xcd; 50];
        let expected4 = "82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b";
        assert_eq!(hmac_sha256(&key4, &data4), expected4);

        // RFC 4231 Test Case 6 (key larger than 64-byte block size)
        let key6 = [0xaa; 131];
        let data6 = b"Test Using Larger Than Block-Size Key - Hash Key First";
        let expected6 = "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54";
        assert_eq!(hmac_sha256(&key6, data6), expected6);
    }

    #[test]
    fn test_pairing_lifecycle_and_validation() {
        let mut reg = CompanionRegistry::new();
        assert_eq!(reg.get_state(), CompanionPairingState::Unpaired);

        let req = reg.request_pairing().expect("Must request pairing");
        match req {
            CompanionPairingState::PairingRequested {
                ref pairing_code,
                ref qr_payload,
                expires_at_ms,
            } => {
                assert_eq!(pairing_code.len(), 6);
                assert!(pairing_code.chars().all(|c| c.is_ascii_digit()));
                assert!(qr_payload.contains("xyeena-companion-v1"));
                assert!(expires_at_ms > current_time_ms());

                // Invalid code fails
                let fail =
                    reg.confirm_pairing("dev_1".into(), "Pixel 8".into(), "000000", "bad_token");
                assert!(fail.is_err());
            }
            _ => panic!("Expected PairingRequested"),
        }
    }

    #[test]
    fn test_confirm_pairing_and_mobile_approval_binding() {
        let mut reg = CompanionRegistry::new();
        let req = reg.request_pairing().expect("Must request pairing");
        let (code, token) = match req {
            CompanionPairingState::PairingRequested {
                pairing_code,
                qr_payload,
                ..
            } => {
                let v: serde_json::Value = serde_json::from_str(&qr_payload).expect("Valid JSON");
                let tok = v["token"].as_str().expect("Token str").to_string();
                (pairing_code, tok)
            }
            _ => panic!("Expected PairingRequested"),
        };

        // 32-byte secret in hex = 64 characters
        assert_eq!(token.len(), 64);

        let device = reg
            .confirm_pairing(
                "android_pixel_8".into(),
                "Hafizh's Pixel 8".into(),
                &code,
                &token,
            )
            .expect("Must confirm pairing");

        assert_eq!(device.device_id, "android_pixel_8");
        assert_eq!(reg.get_state(), CompanionPairingState::Paired(device));

        let now = current_time_ms();
        let payload = MobileApprovalPayload {
            device_id: "android_pixel_8".into(),
            request_id: "req-123".into(),
            action_fingerprint: "action_sha256_mock_fingerprint".into(),
            expires_at_ms: now + 60_000,
            nonce_or_counter: 1,
            decision: "allow_once".into(),
        };

        let canonical = payload.canonical_message();
        let sig = compute_signature(&token, &canonical);

        // 1. Valid signature passes verification
        assert!(reg.verify_mobile_approval(&payload, &sig, now).is_ok());

        // 2. Replay attack: same request_id and nonce_or_counter rejected
        let replay_err = reg.verify_mobile_approval(&payload, &sig, now);
        assert!(replay_err.is_err());
        assert!(replay_err.unwrap_err().contains("Replay attack detected"));

        // 3. Expired submission rejected
        let expired_payload = MobileApprovalPayload {
            nonce_or_counter: 2,
            expires_at_ms: now - 1000,
            ..payload.clone()
        };
        let expired_sig = compute_signature(&token, &expired_payload.canonical_message());
        let exp_err = reg.verify_mobile_approval(&expired_payload, &expired_sig, now);
        assert!(exp_err.is_err());
        assert!(exp_err.unwrap_err().contains("expired"));

        // 4. Tampered payload rejected
        let tampered_payload = MobileApprovalPayload {
            nonce_or_counter: 3,
            action_fingerprint: "tampered_fingerprint".into(),
            ..payload.clone()
        };
        let tamp_err = reg.verify_mobile_approval(&tampered_payload, &sig, now);
        assert!(tamp_err.is_err());
        assert!(tamp_err
            .unwrap_err()
            .contains("Invalid mobile approval signature"));

        // 5. Cross-device attack rejected
        let cross_payload = MobileApprovalPayload {
            device_id: "rogue_device_99".into(),
            nonce_or_counter: 4,
            ..payload.clone()
        };
        let cross_sig = compute_signature(&token, &cross_payload.canonical_message());
        let cross_err = reg.verify_mobile_approval(&cross_payload, &cross_sig, now);
        assert!(cross_err.is_err());
        assert!(cross_err
            .unwrap_err()
            .contains("Cross-device approval rejected"));

        // 6. Mobile approval execution is disabled
        let fresh_payload = MobileApprovalPayload {
            nonce_or_counter: 5,
            ..payload.clone()
        };
        let fresh_sig = compute_signature(&token, &fresh_payload.canonical_message());
        let exec_err = reg.execute_mobile_approval(&fresh_payload, &fresh_sig, now);
        assert!(exec_err.is_err());
        assert!(exec_err.unwrap_err().contains("execution is disabled"));

        // 7. Revocation clears credentials and rejects approvals
        assert!(reg.revoke());
        assert_eq!(reg.get_state(), CompanionPairingState::Unpaired);
        let post_revoke_payload = MobileApprovalPayload {
            nonce_or_counter: 6,
            ..payload
        };
        let post_revoke_sig = compute_signature(&token, &post_revoke_payload.canonical_message());
        assert!(reg
            .verify_mobile_approval(&post_revoke_payload, &post_revoke_sig, now)
            .is_err());
    }
}
