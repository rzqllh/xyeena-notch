import test from 'node:test';
import assert from 'node:assert/strict';
import {
  t,
  getDictionary,
  SUPPORTED_LANGUAGES,
  TRANSLATIONS,
} from '../src/core/i18n.mjs';

test('i18n has complete 1:1 key parity between English and Bahasa Indonesia', () => {
  const enKeys = Object.keys(TRANSLATIONS.en).sort();
  const idKeys = Object.keys(TRANSLATIONS.id).sort();

  assert.deepEqual(
    enKeys,
    idKeys,
    `Key mismatch between en and id: missing in id: ${enKeys.filter(k => !idKeys.includes(k)).join(', ')}, missing in en: ${idKeys.filter(k => !enKeys.includes(k)).join(', ')}`
  );

  assert.equal(enKeys.length > 30, true);
});

test('i18n translation getter returns accurate localized text and handles fallbacks', () => {
  // English
  assert.equal(t('nav_now', 'en'), 'Now');
  assert.equal(t('nav_settings', 'en'), 'Settings');
  assert.equal(t('btn_recenter', 'en'), 'Recenter');

  // Indonesian
  assert.equal(t('nav_now', 'id'), 'Sekarang');
  assert.equal(t('nav_settings', 'id'), 'Pengaturan');
  assert.equal(t('btn_recenter', 'id'), 'Tengahkan');

  // Unsupported language code falls back to English
  assert.equal(t('nav_now', /** @type {any} */ ('fr')), 'Now');

  // Parameter replacement
  // @ts-ignore
  TRANSLATIONS.en._test_greet = 'Hello {name}!';
  // @ts-ignore
  assert.equal(t('_test_greet', 'en', { name: 'Xyn' }), 'Hello Xyn!');
});

test('supported languages catalog includes en and id', () => {
  assert.deepEqual(SUPPORTED_LANGUAGES, ['en', 'id']);
  const dict = getDictionary('id');
  assert.equal(typeof dict, 'object');
  assert.equal(dict.nav_chat, 'Chat');
});
