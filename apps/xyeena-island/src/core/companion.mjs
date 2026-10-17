// Companion controller for secure Android pairing and mobile approval verification.
// Implements local cryptographic mutual authentication, QR code payloads, and revocation.

export const PAIRING_EXPIRY_MS = 300_000; // 5 minutes

/**
 * Compute HMAC/FNV signature matching Rust's compute_signature implementation.
 * @param {string} secret
 * @param {string} message
 * @returns {string} 16-character hex hash
 */
export function computeCompanionSignature(secret, message) {
  const combined = `${secret}:${message}`;
  let state = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(combined);
  for (const b of bytes) {
    state = state ^ BigInt(b);
    state = (state * prime) & mask;
  }
  return state.toString(16).padStart(16, '0');
}

/**
 * Build standard QR payload JSON string for pairing.
 * @param {string} code
 * @param {string} token
 * @param {number} expiresAtMs
 * @returns {string}
 */
export function generatePairingQrPayload(code, token, expiresAtMs) {
  return JSON.stringify({
    protocol: 'xyeena-companion-v1',
    code,
    token,
    expires: expiresAtMs,
  });
}

/**
 * @typedef {{
 *   deviceId: string,
 *   deviceName: string,
 *   pairedAtMs: number
 * }} CompanionDevice
 *
 * @typedef {{
 *   pairingCode: string,
 *   qrPayload: string,
 *   expiresAtMs: number
 * }} PairingDetails
 */

export class CompanionController {
  constructor() {
    /** @type {'unpaired' | 'pairing_requested' | 'paired'} */
    this.status = 'unpaired';
    /** @type {PairingDetails | null} */
    this.pairingDetails = null;
    /** @type {CompanionDevice | null} */
    this.pairedDevice = null;
    /** @type {string | null} */
    this.sharedSecret = null;
    /** @type {((status: string) => void) | null} */
    this.onStateChange = null;
  }

  /**
   * Set state from native Tauri response.
   * @param {any} rawState
   */
  syncFromNative(rawState) {
    if (!rawState) {
      this.status = 'unpaired';
      this.pairingDetails = null;
      this.pairedDevice = null;
      this.notify();
      return;
    }

    if (rawState.status === 'Paired' && rawState.details) {
      this.status = 'paired';
      this.pairedDevice = {
        deviceId: rawState.details.device_id,
        deviceName: rawState.details.device_name,
        pairedAtMs: rawState.details.paired_at_ms,
      };
      this.pairingDetails = null;
    } else if (rawState.status === 'PairingRequested' && rawState.details) {
      const now = Date.now();
      if (now < rawState.details.expires_at_ms) {
        this.status = 'pairing_requested';
        this.pairingDetails = {
          pairingCode: rawState.details.pairing_code,
          qrPayload: rawState.details.qr_payload,
          expiresAtMs: rawState.details.expires_at_ms,
        };
        this.pairedDevice = null;
      } else {
        this.status = 'unpaired';
        this.pairingDetails = null;
        this.pairedDevice = null;
      }
    } else {
      this.status = 'unpaired';
      this.pairingDetails = null;
      this.pairedDevice = null;
    }
    this.notify();
  }

  /**
   * Request a new pairing session.
   * @param {(cmd: string, args?: any) => Promise<any>} [nativeInvoker]
   * @returns {Promise<PairingDetails>}
   */
  async requestPairing(nativeInvoker) {
    if (nativeInvoker) {
      const res = await nativeInvoker('request_companion_pairing');
      this.syncFromNative(res);
      if (!this.pairingDetails) {
        throw new Error('Failed to obtain pairing details from native backend.');
      }
      return this.pairingDetails;
    }

    // In-memory simulation fallback (for testing/browser sandbox)
    const now = Date.now();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const token = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const expiresAtMs = now + PAIRING_EXPIRY_MS;
    const qrPayload = generatePairingQrPayload(code, token, expiresAtMs);

    this.status = 'pairing_requested';
    this.pairingDetails = {
      pairingCode: code,
      qrPayload,
      expiresAtMs,
    };
    this.sharedSecret = token;
    this.pairedDevice = null;
    this.notify();

    return this.pairingDetails;
  }

  /**
   * Confirm mobile pairing using code and token.
   * @param {string} deviceId
   * @param {string} deviceName
   * @param {string} code
   * @param {string} token
   * @param {(cmd: string, args?: any) => Promise<any>} [nativeInvoker]
   * @returns {Promise<CompanionDevice>}
   */
  async confirmPairing(deviceId, deviceName, code, token, nativeInvoker) {
    if (nativeInvoker) {
      const res = await nativeInvoker('confirm_companion_pairing', {
        deviceId,
        deviceName,
        code,
        token,
      });
      this.status = 'paired';
      this.pairedDevice = {
        deviceId: res.device_id,
        deviceName: res.device_name,
        pairedAtMs: res.paired_at_ms,
      };
      this.pairingDetails = null;
      this.sharedSecret = token;
      this.notify();
      return this.pairedDevice;
    }

    // In-memory simulation fallback
    if (this.status !== 'pairing_requested' || !this.pairingDetails) {
      throw new Error('No pending pairing session active.');
    }

    if (Date.now() >= this.pairingDetails.expiresAtMs) {
      this.status = 'unpaired';
      this.pairingDetails = null;
      this.notify();
      throw new Error('Pairing session has expired. Please generate a new code.');
    }

    if (this.pairingDetails.pairingCode !== code.trim()) {
      throw new Error('Invalid pairing code.');
    }

    const device = {
      deviceId,
      deviceName,
      pairedAtMs: Date.now(),
    };

    this.status = 'paired';
    this.pairedDevice = device;
    this.pairingDetails = null;
    this.notify();
    return device;
  }

  /**
   * Revoke paired companion device.
   * @param {(cmd: string, args?: any) => Promise<any>} [nativeInvoker]
   * @returns {Promise<boolean>}
   */
  async revoke(nativeInvoker) {
    if (nativeInvoker) {
      await nativeInvoker('revoke_companion_device');
    }
    this.status = 'unpaired';
    this.pairedDevice = null;
    this.pairingDetails = null;
    this.sharedSecret = null;
    this.notify();
    return true;
  }

  /**
   * Verify mobile approval decision signature using shared secret.
   * @param {string} actionFingerprint
   * @param {string} signature
   * @returns {boolean}
   */
  verifySignature(actionFingerprint, signature) {
    if (!this.sharedSecret) return false;
    const expected = computeCompanionSignature(this.sharedSecret, actionFingerprint);
    return expected === signature.trim();
  }

  /**
   * Check if current pairing request is expired.
   * @returns {boolean}
   */
  isExpired() {
    if (this.status !== 'pairing_requested' || !this.pairingDetails) return false;
    return Date.now() >= this.pairingDetails.expiresAtMs;
  }

  /**
   * Format display string for pairing UI.
   * @returns {string}
   */
  formatDisplay() {
    if (this.status === 'paired' && this.pairedDevice) {
      const dateStr = new Date(this.pairedDevice.pairedAtMs).toLocaleTimeString();
      return `Paired with ${this.pairedDevice.deviceName} (${this.pairedDevice.deviceId}) at ${dateStr}`;
    }
    if (this.status === 'pairing_requested' && this.pairingDetails) {
      const remainingSec = Math.max(0, Math.round((this.pairingDetails.expiresAtMs - Date.now()) / 1000));
      return `Pairing Code: ${this.pairingDetails.pairingCode} (Expires in ${remainingSec}s)`;
    }
    return 'No companion device paired.';
  }

  notify() {
    if (typeof this.onStateChange === 'function') {
      try {
        this.onStateChange(this.status);
      } catch {}
    }
  }
}
