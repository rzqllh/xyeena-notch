import test from 'node:test';
import assert from 'node:assert/strict';
import {
  icon,
  renderIcon,
  hasIcon,
  listIcons,
  PHOSPHOR_ICONS,
  PHOSPHOR_VIEWBOX
} from '../src/core/icons.mjs';

test('Phosphor Icons: PHOSPHOR_VIEWBOX is 0 0 256 256', () => {
  assert.equal(PHOSPHOR_VIEWBOX, '0 0 256 256');
});

test('Phosphor Icons: All verified UI call site icons exist in registry', () => {
  const verifiedCallSites = [
    'folder',
    'play',
    'pause',
    'prev',
    'next',
    'chevron',
    'collapse',
    'pin',
    'sliders',
    'refresh',
    'music',
    'volume',
    'mute',
    'search'
  ];

  for (const name of verifiedCallSites) {
    assert.ok(hasIcon(name), `Expected icon "${name}" to be registered`);
    assert.ok(typeof PHOSPHOR_ICONS[name] === 'string' && PHOSPHOR_ICONS[name].length > 10, `Expected path data for "${name}"`);
  }
});

test('Phosphor Icons: Semantic fallbacks exist in registry', () => {
  const fallbacks = [
    'logo',
    'shield',
    'bell',
    'activity',
    'clock',
    'alert',
    'copy',
    'headset',
    'send',
    'check'
  ];

  for (const name of fallbacks) {
    assert.ok(hasIcon(name), `Expected fallback icon "${name}" to be registered`);
  }
});

test('Phosphor Icons: icon() produces valid SVG markup with dimensions and fill', () => {
  const rendered = icon('folder', 24);
  assert.ok(rendered.startsWith('<svg'), 'Must produce <svg tag');
  assert.ok(rendered.endsWith('</svg>'), 'Must close </svg> tag');
  assert.ok(rendered.includes('width="24"'), 'Must have width="24"');
  assert.ok(rendered.includes('height="24"'), 'Must have height="24"');
  assert.ok(rendered.includes('viewBox="0 0 256 256"'), 'Must have standard 256x256 viewBox');
  assert.ok(rendered.includes('fill="currentColor"'), 'Must use fill="currentColor"');
  assert.ok(rendered.includes('aria-hidden="true"'), 'Default icon must be aria-hidden');
});

test('Phosphor Icons: Accessibility options render proper attributes and title', () => {
  const labeled = renderIcon('play', 18, { label: 'Play media track' });
  assert.ok(labeled.includes('role="img"'), 'Must have role="img" when labeled');
  assert.ok(labeled.includes('aria-label="Play media track"'), 'Must have aria-label');
  assert.ok(!labeled.includes('aria-hidden="true"'), 'Must not be aria-hidden when labeled');

  const titled = renderIcon('pause', 18, { title: 'Pause media playback' });
  assert.ok(titled.includes('<title>Pause media playback</title>'), 'Must contain <title> tag');

  const customClass = renderIcon('music', 20, { className: 'custom-icon' });
  assert.ok(customClass.includes('class="custom-icon"'), 'Must include custom class');
});

test('Phosphor Icons: Unknown icon safely falls back to logo without throwing', () => {
  const fallback = icon('unknown-test-icon-123', 16);
  assert.ok(fallback.startsWith('<svg'), 'Fallback must produce valid SVG');
  assert.ok(fallback.includes(PHOSPHOR_ICONS.logo), 'Fallback must use default logo path');
});

test('Phosphor Icons: listIcons() returns complete list of registered icons', () => {
  const list = listIcons();
  assert.ok(list.length >= 20, 'Should have at least 20 registered icons');
  assert.ok(list.includes('folder'));
  assert.ok(list.includes('play'));
  assert.ok(list.includes('search'));
});
