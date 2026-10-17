import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CompanionController,
  computeCompanionSignature,
  generatePairingQrPayload,
} from '../src/core/companion.mjs';

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
  assert.equal(parsedQr.token.length, 32);
  assert.equal(parsedQr.expires, pairing.expiresAtMs);

  const display = controller.formatDisplay();
  assert.match(display, /Pairing Code: \d{6}/);
});

test('CompanionController confirmation and invalid code rejection', async () => {
  const controller = new CompanionController();
  const pairing = await controller.requestPairing();

  // Reject invalid code
  await assert.rejects(async () => {
    await controller.confirmPairing('pixel_7_001', 'Pixel 7 Pro', '000000', 'wrong_token');
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

  await controller.confirmPairing('pixel_7_001', 'Pixel 7 Pro', controller.pairingDetails.pairingCode, secret);

  const actionFingerprint = 'request_execute_command:git_status:seq_42';
  const validSignature = computeCompanionSignature(secret, actionFingerprint);
  assert.equal(typeof validSignature, 'string');
  assert.equal(validSignature.length, 16);

  // Verification succeeds with matching signature
  assert.equal(controller.verifySignature(actionFingerprint, validSignature), true);

  // Verification fails on tampered message
  assert.equal(controller.verifySignature('tampered_action', validSignature), false);

  // Verification fails on invalid signature
  assert.equal(controller.verifySignature(actionFingerprint, 'badsignature1234'), false);

  // Revocation clears credentials and rejects verification
  await controller.revoke();
  assert.equal(controller.status, 'unpaired');
  assert.equal(controller.pairedDevice, null);
  assert.equal(controller.verifySignature(actionFingerprint, validSignature), false);
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
