import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CompanionController,
  computeCompanionSignature,
  constantTimeCompare,
  generatePairingQrPayload,
  hmacSha256,
} from '../src/core/companion.mjs';

test('RFC 4231 HMAC-SHA256 test cases in JavaScript', () => {
  const encoder = new TextEncoder();

  // Test Case 1
  const k1 = new Uint8Array(20).fill(0x0b);
  const d1 = encoder.encode('Hi There');
  assert.equal(
    hmacSha256(k1, d1),
    'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
  );

  // Test Case 2
  const k2 = encoder.encode('Jefe');
  const d2 = encoder.encode('what do ya want for nothing?');
  assert.equal(
    hmacSha256(k2, d2),
    '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
  );

  // Test Case 3
  const k3 = new Uint8Array(20).fill(0xaa);
  const d3 = new Uint8Array(50).fill(0xdd);
  assert.equal(
    hmacSha256(k3, d3),
    '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe'
  );

  // Test Case 4
  const k4 = new Uint8Array([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    22, 23, 24, 25,
  ]);
  const d4 = new Uint8Array(50).fill(0xcd);
  assert.equal(
    hmacSha256(k4, d4),
    '82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b'
  );

  // Test Case 6
  const k6 = new Uint8Array(131).fill(0xaa);
  const d6 = encoder.encode(
    'Test Using Larger Than Block-Size Key - Hash Key First'
  );
  assert.equal(
    hmacSha256(k6, d6),
    '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54'
  );
});

test('constantTimeCompare behavior', () => {
  assert.equal(constantTimeCompare('secret123', 'secret123'), true);
  assert.equal(constantTimeCompare('secret123', 'secret124'), false);
  assert.equal(constantTimeCompare('short', 'longer_string'), false);
  assert.equal(constantTimeCompare('', ''), true);
});

test('CompanionController pairing lifecycle and QR payload formatting', async () => {
  const controller = new CompanionController();

  assert.equal(controller.status, 'unpaired');
  assert.equal(controller.pairedDevice, null);

  const pairing = await controller.requestPairing();
  assert.equal(controller.status, 'pairing_requested');
  assert.equal(typeof pairing.pairingCode, 'string');
  assert.equal(pairing.pairingCode.length, 6);
  assert.equal(controller.isExpired(), false);

  const parsedQr = JSON.parse(pairing.qrPayload);
  assert.equal(parsedQr.protocol, 'xyeena-companion-v1');
  assert.equal(parsedQr.code, pairing.pairingCode);
  assert.equal(typeof parsedQr.token, 'string');
  // 32 random bytes = 64 hexadecimal characters
  assert.equal(parsedQr.token.length, 64);
  assert.equal(parsedQr.expires, pairing.expiresAtMs);

  const display = controller.formatDisplay();
  assert.match(display, /Pairing Code: \d{6}/);
});

test('CompanionController confirmation and invalid code rejection', async () => {
  const controller = new CompanionController();
  const pairing = await controller.requestPairing();

  // Reject invalid code
  await assert.rejects(async () => {
    await controller.confirmPairing(
      'pixel_7_001',
      'Pixel 7 Pro',
      '000000',
      'wrong_token'
    );
  }, /Invalid pairing code/);

  // Accept valid code
  const device = await controller.confirmPairing(
    'pixel_7_001',
    'Pixel 7 Pro',
    pairing.pairingCode,
    controller.sharedSecret
  );

  assert.equal(controller.status, 'paired');
  assert.equal(device.deviceId, 'pixel_7_001');
  assert.equal(device.deviceName, 'Pixel 7 Pro');
  assert.equal(controller.pairingDetails, null);

  const display = controller.formatDisplay();
  assert.match(display, /Paired with Pixel 7 Pro \(pixel_7_001\)/);
});

test('CompanionController signature computation and verification', async () => {
  const controller = new CompanionController();
  await controller.requestPairing();
  const secret = controller.sharedSecret;

  await controller.confirmPairing(
    'pixel_7_001',
    'Pixel 7 Pro',
    controller.pairingDetails.pairingCode,
    secret
  );

  const actionFingerprint = 'request_execute_command:git_status:seq_42';
  const validSignature = computeCompanionSignature(secret, actionFingerprint);
  assert.equal(typeof validSignature, 'string');
  // 256-bit HMAC-SHA256 = 64 hex characters
  assert.equal(validSignature.length, 64);

  // Verification succeeds with matching signature
  assert.equal(
    controller.verifySignature(actionFingerprint, validSignature),
    true
  );

  // Verification fails on tampered message
  assert.equal(
    controller.verifySignature('tampered_action', validSignature),
    false
  );

  // Verification fails on invalid signature
  assert.equal(
    controller.verifySignature(actionFingerprint, 'badsignature1234'),
    false
  );

  // Revocation clears credentials and rejects verification
  await controller.revoke();
  assert.equal(controller.status, 'unpaired');
  assert.equal(controller.pairedDevice, null);
  assert.equal(
    controller.verifySignature(actionFingerprint, validSignature),
    false
  );
});

test('CompanionController mobile approval binding, replay protection, and execution disablement', async () => {
  const controller = new CompanionController();
  await controller.requestPairing();
  const secret = controller.sharedSecret;

  await controller.confirmPairing(
    'pixel_7_001',
    'Pixel 7 Pro',
    controller.pairingDetails.pairingCode,
    secret
  );

  const now = Date.now();
  const validPayload = {
    deviceId: 'pixel_7_001',
    requestId: 'req_12345',
    actionFingerprint: 'cmd_exec:echo_42',
    decision: 'allow',
    expiresAtMs: now + 60_000,
    nonceOrCounter: 1001,
  };

  const canonicalMsg = `${validPayload.deviceId}:${validPayload.requestId}:${validPayload.actionFingerprint}:${validPayload.decision}:${validPayload.expiresAtMs}:${validPayload.nonceOrCounter}`;
  const validSig = computeCompanionSignature(secret, canonicalMsg);

  // 1. Happy path verification
  assert.equal(controller.verifyMobileApproval(validPayload, validSig), true);

  // 2. Replay attack rejected (same nonceOrCounter)
  assert.equal(controller.verifyMobileApproval(validPayload, validSig), false);

  // 3. Expired payload rejected
  const expiredPayload = {
    ...validPayload,
    expiresAtMs: now - 1000,
    nonceOrCounter: 1002,
  };
  const expiredSig = computeCompanionSignature(
    secret,
    `${expiredPayload.deviceId}:${expiredPayload.requestId}:${expiredPayload.actionFingerprint}:${expiredPayload.decision}:${expiredPayload.expiresAtMs}:${expiredPayload.nonceOrCounter}`
  );
  assert.equal(
    controller.verifyMobileApproval(expiredPayload, expiredSig),
    false
  );

  // 4. Cross-device attack rejected
  const crossPayload = {
    ...validPayload,
    deviceId: 'attacker_phone_007',
    nonceOrCounter: 1003,
  };
  const crossSig = computeCompanionSignature(
    secret,
    `${crossPayload.deviceId}:${crossPayload.requestId}:${crossPayload.actionFingerprint}:${crossPayload.decision}:${crossPayload.expiresAtMs}:${crossPayload.nonceOrCounter}`
  );
  assert.equal(controller.verifyMobileApproval(crossPayload, crossSig), false);

  // 5. Tampered payload rejected
  const tamperedPayload = {
    ...validPayload,
    decision: 'deny',
    nonceOrCounter: 1004,
  };
  assert.equal(
    controller.verifyMobileApproval(tamperedPayload, validSig),
    false
  );

  // 6. Mobile execution fails closed
  await assert.rejects(async () => {
    await controller.executeMobileApproval(validPayload, validSig);
  }, /Mobile approval execution is disabled pending end-to-end authenticated mobile transport acceptance/);
});

test('CompanionController syncFromNative accurately maps Tauri state enums', () => {
  const controller = new CompanionController();

  // Paired from native
  controller.syncFromNative({
    status: 'Paired',
    details: {
      device_id: 'galaxy_s23',
      device_name: 'Samsung Galaxy S23',
      paired_at_ms: 1729000000000,
    },
  });
  assert.equal(controller.status, 'paired');
  assert.equal(controller.pairedDevice?.deviceName, 'Samsung Galaxy S23');

  // PairingRequested from native (active)
  const futureExpiry = Date.now() + 60000;
  controller.syncFromNative({
    status: 'PairingRequested',
    details: {
      pairing_code: '456789',
      qr_payload: '{"protocol":"xyeena-companion-v1"}',
      expires_at_ms: futureExpiry,
    },
  });
  assert.equal(controller.status, 'pairing_requested');
  assert.equal(controller.pairingDetails?.pairingCode, '456789');

  // Unpaired
  controller.syncFromNative({ status: 'Unpaired' });
  assert.equal(controller.status, 'unpaired');
  assert.equal(controller.pairingDetails, null);
  assert.equal(controller.pairedDevice, null);
});
