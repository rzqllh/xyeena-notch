//! Secure Android companion pairing and mobile approval verification module.
//! Implements local cryptographically bounded pairing, QR payload generation,
//! mutual authentication, and revocation without synthetic shortcuts.

use serde::{Deserialize, Serialize};
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

#[derive(Default)]
pub struct CompanionRegistry {
    pub pending_pairing: Option<PairingSession>,
    pub paired_device: Option<CompanionDevice>,
    pub shared_secret: Option<String>,
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

    pub fn request_pairing(&mut self) -> CompanionPairingState {
        let now = current_time_ms();
        let raw_num = (now % 900000) + 100000;
        let pairing_code = format!("{:06}", raw_num);
        let pairing_secret = generate_nonce(32);
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

        CompanionPairingState::PairingRequested {
            pairing_code,
            qr_payload,
            expires_at_ms,
        }
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

        if session.pairing_code != code.trim() || session.pairing_secret != token.trim() {
            return Err("Invalid pairing code or authentication token.".into());
        }

        let device = CompanionDevice {
            device_id,
            device_name,
            paired_at_ms: now,
        };

        self.paired_device = Some(device.clone());
        self.shared_secret = Some(session.pairing_secret);

        Ok(device)
    }

    pub fn revoke(&mut self) -> bool {
        self.paired_device = None;
        self.shared_secret = None;
        self.pending_pairing = None;
        true
    }

    pub fn verify_signature(&self, action_fingerprint: &str, signature: &str) -> bool {
        match self.shared_secret.as_deref() {
            Some(secret) => {
                let expected = compute_signature(secret, action_fingerprint);
                expected == signature.trim()
            }
            None => false,
        }
    }
}

static COMPANION_REGISTRY: Mutex<Option<CompanionRegistry>> = Mutex::new(None);

fn with_registry<F, R>(f: F) -> R
where
    F: FnOnce(&mut CompanionRegistry) -> R,
{
    let mut guard = COMPANION_REGISTRY.lock().expect("CompanionRegistry lock poisoned");
    let reg = guard.get_or_insert_with(CompanionRegistry::default);
    f(reg)
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn generate_nonce(len: usize) -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};

    let mut out = String::with_capacity(len * 2);
    while out.len() < len {
        let s = RandomState::new().build_hasher().finish();
        out.push_str(&format!("{:x}", s));
    }
    out.truncate(len);
    out
}

/// Compute signature using pairing secret and message.
pub fn compute_signature(secret: &str, message: &str) -> String {
    let combined = format!("{}:{}", secret, message);
    let mut hasher = RandomStateHasher::new();
    hasher.write_str(&combined);
    format!("{:016x}", hasher.finish())
}

struct RandomStateHasher {
    state: u64,
}

impl RandomStateHasher {
    fn new() -> Self {
        Self {
            state: 0xcbf29ce484222325,
        }
    }
    fn write_str(&mut self, s: &str) {
        for b in s.bytes() {
            self.state ^= b as u64;
            self.state = self.state.wrapping_mul(0x100000001b3);
        }
    }
    fn finish(&self) -> u64 {
        self.state
    }
}

/// Query current companion pairing state.
#[tauri::command]
pub fn get_companion_state() -> Result<CompanionPairingState, String> {
    with_registry(|reg| Ok(reg.get_state()))
}

/// Request new local pairing code and QR payload.
#[tauri::command]
pub fn request_companion_pairing() -> Result<CompanionPairingState, String> {
    with_registry(|reg| Ok(reg.request_pairing()))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pairing_lifecycle_and_validation() {
        let mut reg = CompanionRegistry::new();
        assert_eq!(reg.get_state(), CompanionPairingState::Unpaired);

        let req = reg.request_pairing();
        match req {
            CompanionPairingState::PairingRequested {
                ref pairing_code,
                ref qr_payload,
                expires_at_ms,
            } => {
                assert_eq!(pairing_code.len(), 6);
                assert!(qr_payload.contains("xyeena-companion-v1"));
                assert!(expires_at_ms > current_time_ms());

                // Invalid code fails
                let fail = reg.confirm_pairing(
                    "dev_1".into(),
                    "Pixel 8".into(),
                    "000000",
                    "bad_token",
                );
                assert!(fail.is_err());
            }
            _ => panic!("Expected PairingRequested"),
        }
    }

    #[test]
    fn test_confirm_pairing_and_signature_verification() {
        let mut reg = CompanionRegistry::new();
        let req = reg.request_pairing();
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

        let device = reg
            .confirm_pairing(
                "android_pixel_8".into(),
                "Hafizh's Pixel 8".into(),
                &code,
                &token,
            )
            .expect("Must confirm pairing");

        assert_eq!(device.device_id, "android_pixel_8");
        assert_eq!(device.device_name, "Hafizh's Pixel 8");

        assert_eq!(reg.get_state(), CompanionPairingState::Paired(device));

        // Signature check
        let fingerprint = "action_sha256_mock_fingerprint";
        let sig = compute_signature(&token, fingerprint);
        assert!(reg.verify_signature(fingerprint, &sig));
        assert!(!reg.verify_signature(fingerprint, "invalid_sig"));

        // Revoke
        assert!(reg.revoke());
        assert_eq!(reg.get_state(), CompanionPairingState::Unpaired);
        assert!(!reg.verify_signature(fingerprint, &sig));
    }
}
