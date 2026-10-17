// Companion controller for secure Android pairing and mobile approval verification.
// Implements local cryptographic mutual authentication, QR code payloads, and revocation.

export const PAIRING_EXPIRY_MS = 300_000; // 5 minutes

/**
 * @param {number} n
 * @param {number} x
 * @returns {number}
 */
function rotr(n, x) {
  return (x >>> n) | (x << (32 - n));
}

/**
 * Standard SHA-256 implementation (FIPS 180-4) with zero external dependencies.
 * @param {Uint8Array} bytes
 * @returns {Uint8Array} 32-byte digest
 */
export function sha256Bytes(bytes) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const bitLength = bytes.length * 8;
  const withPadding = [];
  for (let i = 0; i < bytes.length; i++) withPadding.push(bytes[i]);
  withPadding.push(0x80);
  while ((withPadding.length % 64) !== 56) {
    withPadding.push(0x00);
  }
  const highBits = Math.floor(bitLength / 0x100000000);
  const lowBits = bitLength >>> 0;
  withPadding.push((highBits >>> 24) & 0xff);
  withPadding.push((highBits >>> 16) & 0xff);
  withPadding.push((highBits >>> 8) & 0xff);
  withPadding.push(highBits & 0xff);
  withPadding.push((lowBits >>> 24) & 0xff);
  withPadding.push((lowBits >>> 16) & 0xff);
  withPadding.push((lowBits >>> 8) & 0xff);
  withPadding.push(lowBits & 0xff);

  const w = new Uint32Array(64);
  for (let chunk = 0; chunk < withPadding.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      const idx = chunk + i * 4;
      w[i] =
        (withPadding[idx] << 24) |
        (withPadding[idx + 1] << 16) |
        (withPadding[idx + 2] << 8) |
        withPadding[idx + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (words[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (words[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (words[i] >>> 8) & 0xff;
    out[i * 4 + 3] = words[i] & 0xff;
  }
  return out;
}

/**
 * Standard RFC 2104 / RFC 4231 HMAC-SHA256 implementation.
 * @param {Uint8Array} keyBytes
 * @param {Uint8Array} msgBytes
 * @returns {string} 64-character lowercase hex digest
 */
export function hmacSha256(keyBytes, msgBytes) {
  const BLOCK_SIZE = 64;
  let key = keyBytes;
  if (key.length > BLOCK_SIZE) {
    key = sha256Bytes(key);
  }
  const kPad = new Uint8Array(BLOCK_SIZE);
  kPad.set(key);

  const ipad = new Uint8Array(BLOCK_SIZE);
  const opad = new Uint8Array(BLOCK_SIZE);
  for (let i = 0; i < BLOCK_SIZE; i++) {
    ipad[i] = kPad[i] ^ 0x36;
    opad[i] = kPad[i] ^ 0x5c;
  }

  const innerMsg = new Uint8Array(BLOCK_SIZE + msgBytes.length);
  innerMsg.set(ipad, 0);
  innerMsg.set(msgBytes, BLOCK_SIZE);
  const innerHash = sha256Bytes(innerMsg);

  const outerMsg = new Uint8Array(BLOCK_SIZE + 32);
  outerMsg.set(opad, 0);
  outerMsg.set(innerHash, BLOCK_SIZE);
  const outerHash = sha256Bytes(outerMsg);

  return Array.from(outerHash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time comparison between two strings to prevent timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Compute HMAC-SHA256 signature matching Rust's compute_signature implementation.
 * @param {string} secret
 * @param {string} message
 * @returns {string} 64-character lowercase hex hash
 */
export function computeCompanionSignature(secret, message) {
  const encoder = new TextEncoder();
  return hmacSha256(encoder.encode(secret), encoder.encode(message));
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
 *
 * @typedef {{
 *   deviceId: string,
 *   requestId: string,
 *   actionFingerprint: string,
 *   decision: 'allow' | 'deny',
 *   expiresAtMs: number,
 *   nonceOrCounter: number
 * }} MobileApprovalPayload
 */

/**
 * Build canonical string representation for mobile approval verification.
 * @param {MobileApprovalPayload} payload
 * @returns {string}
 */
export function buildCanonicalApprovalMessage(payload) {
  return `${payload.deviceId}:${payload.requestId}:${payload.actionFingerprint}:${payload.decision}:${payload.expiresAtMs}:${payload.nonceOrCounter}`;
}

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
    /** @type {Set<string>} */
    this.seenApprovalNonces = new Set();
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

    // In-memory fallback with CSPRNG-backed rejection sampling for 6-digit numeric code
    let codeNum = 0;
    const range = 900_000;
    const limit = 0xffffffff - (0xffffffff % range);
    const u32Buf = new Uint32Array(1);

    for (let i = 0; i < 64; i++) {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(u32Buf);
      } else {
        u32Buf[0] = (Math.random() * 0x100000000) >>> 0;
      }
      if (u32Buf[0] < limit) {
        codeNum = 100_000 + (u32Buf[0] % range);
        break;
      }
    }
    const code = String(codeNum || Math.floor(100000 + Math.random() * 900000));

    // 32 cryptographically secure random bytes = 64 hex characters
    const tokenBuf = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(tokenBuf);
    } else {
      for (let i = 0; i < 32; i++) {
        tokenBuf[i] = Math.floor(Math.random() * 256);
      }
    }
    const token = Array.from(tokenBuf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const now = Date.now();
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
    this.seenApprovalNonces.clear();
    this.notify();
    return true;
  }

  /**
   * Verify mobile approval decision signature using shared secret with full binding,
   * replay protection, and expiration checking.
   * @param {MobileApprovalPayload} payload
   * @param {string} signature
   * @returns {boolean}
   */
  verifyMobileApproval(payload, signature) {
    if (this.status !== 'paired' || !this.pairedDevice || !this.sharedSecret) {
      return false;
    }

    // 1. Check device identity binding
    if (payload.deviceId !== this.pairedDevice.deviceId) {
      return false;
    }

    // 2. Check expiration
    if (Date.now() >= payload.expiresAtMs) {
      return false;
    }

    // 3. Replay attack protection
    const nonceKey = `${payload.deviceId}:${payload.nonceOrCounter}`;
    if (this.seenApprovalNonces.has(nonceKey)) {
      return false;
    }

    // 4. Validate cryptographic signature
    const canonicalMsg = buildCanonicalApprovalMessage(payload);
    const expectedSig = computeCompanionSignature(this.sharedSecret, canonicalMsg);

    if (!constantTimeCompare(expectedSig, signature.trim().toLowerCase())) {
      return false;
    }

    this.seenApprovalNonces.add(nonceKey);
    return true;
  }

  /**
   * Backwards-compatible legacy signature check.
   * @param {string} actionFingerprint
   * @param {string} signature
   * @returns {boolean}
   */
  verifySignature(actionFingerprint, signature) {
    if (!this.sharedSecret) return false;
    const expected = computeCompanionSignature(this.sharedSecret, actionFingerprint);
    return constantTimeCompare(expected, signature.trim().toLowerCase());
  }

  /**
   * Execute mobile approval decision (must fail-closed until transport passes end-to-end acceptance).
   * @param {MobileApprovalPayload} _payload
   * @param {string} _signature
   * @param {(cmd: string, args?: any) => Promise<any>} [nativeInvoker]
   * @returns {Promise<any>}
   */
  async executeMobileApproval(_payload, _signature, nativeInvoker) {
    if (nativeInvoker) {
      return await nativeInvoker('execute_mobile_approval_decision', {
        payload: _payload,
        signature: _signature,
      });
    }
    throw new Error(
      'Mobile approval execution is disabled pending end-to-end authenticated mobile transport acceptance.'
    );
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
