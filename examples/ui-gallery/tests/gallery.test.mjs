/**
 * @file examples/ui-gallery/tests/gallery.test.mjs
 * Automated verification test suite for Xyeena Island UI Primitives Gallery.
 * Ref: 03-PHASE-2-UI-FOUNDATION.md / Gate 3 & W6.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const galleryDir = resolve(__dirname, '..');
const rootDir = resolve(galleryDir, '../..');

test('UI Gallery HTML contains all required review controls (theme, scale, motion, RTL)', async () => {
  const html = await readFile(resolve(galleryDir, 'index.html'), 'utf8');

  // Theme selector
  assert.match(html, /id="theme-select"/, 'Must contain theme-select element');
  assert.match(html, /value="dark"/, 'Must support dark theme');
  assert.match(html, /value="light"/, 'Must support light theme');
  assert.match(html, /value="system"/, 'Must support system theme');

  // Scale buttons
  assert.match(html, /data-scale-val="100"/, 'Must contain 100% scale button');
  assert.match(html, /data-scale-val="125"/, 'Must contain 125% scale button');
  assert.match(html, /data-scale-val="150"/, 'Must contain 150% scale button');

  // Reduced motion toggle
  assert.match(html, /id="motion-toggle"/, 'Must contain reduced motion toggle');

  // RTL toggle
  assert.match(html, /id="rtl-toggle"/, 'Must contain RTL toggle');
});

test('UI Gallery HTML defines sections for tokens, icons, and all 21 primitives', async () => {
  const html = await readFile(resolve(galleryDir, 'index.html'), 'utf8');

  const requiredSections = [
    'tokens',
    'icons',
    'icon',
    'button',
    'icon-button',
    'toggle',
    'checkbox',
    'select',
    'text-field',
    'secret-field',
    'tabs',
    'pill',
    'badge',
    'status-dot',
    'row',
    'section-header',
    'scroll-area',
    'empty-state',
    'toast',
    'popover',
    'dialog',
    'kbd',
    'tooltip'
  ];

  for (const sec of requiredSections) {
    assert.match(
      html,
      new RegExp(`id="${sec}"`),
      `Gallery must define a section container for '${sec}'`
    );
  }
});

test('UI Gallery app.mjs imports all 21 primitives and contains zero emoji or text-glyph icons', async () => {
  const appJs = await readFile(resolve(galleryDir, 'app.mjs'), 'utf8');

  const requiredPrimitives = [
    'Icon',
    'Button',
    'IconButton',
    'Toggle',
    'Checkbox',
    'Select',
    'TextField',
    'SecretField',
    'Tabs',
    'Pill',
    'Badge',
    'StatusDot',
    'Row',
    'SectionHeader',
    'ScrollArea',
    'EmptyState',
    'Toast',
    'Popover',
    'Dialog',
    'Kbd',
    'Tooltip'
  ];

  for (const prim of requiredPrimitives) {
    assert.match(appJs, new RegExp(`\\b${prim}\\b`), `app.mjs must reference primitive ${prim}`);
  }

  // Zero emoji regex
  const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/u;
  assert.doesNotMatch(appJs, EMOJI_REGEX, 'app.mjs must contain zero emoji icons');

  // Zero text glyph close button regex
  const TEXT_GLYPH_REGEX = /['"][×✕✖]['"]/u;
  assert.doesNotMatch(appJs, TEXT_GLYPH_REGEX, 'app.mjs must contain zero text glyph close icons');
});

// Mock DOM environment for headless node:test execution of all gallery primitives
class MockElement {
  constructor(tag, isSvg = false) {
    this.tagName = tag.toUpperCase();
    this.isSvg = isSvg;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this._textContent = '';
    this.style = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.tabIndex = -1;
    this.type = 'text';
    this.parentNode = null;
  }
  get textContent() {
    if (this.children.length > 0) return this.children.map(c => c.textContent).join('');
    return this._textContent;
  }
  set textContent(v) {
    this._textContent = String(v);
    this.children = [];
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'class') this.className = String(v);
  }
  getAttribute(k) { return this.attributes[k]; }
  removeAttribute(k) { delete this.attributes[k]; }
  appendChild(c) {
    if (c) {
      this.children.push(c);
      if (typeof c === 'object') c.parentNode = this;
    }
    return c;
  }
  removeChild(c) {
    const idx = this.children.indexOf(c);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      if (c && typeof c === 'object') c.parentNode = null;
    }
    return c;
  }
  insertBefore(newChild, refChild) {
    if (!newChild) return newChild;
    const idx = this.children.indexOf(refChild);
    if (idx >= 0) {
      this.children.splice(idx, 0, newChild);
    } else {
      this.children.push(newChild);
    }
    if (typeof newChild === 'object') newChild.parentNode = this;
    return newChild;
  }
  contains(child) {
    if (!child) return false;
    if (this.children.includes(child)) return true;
    return this.children.some(c => c.contains && c.contains(child));
  }
  addEventListener(event, fn) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }
  removeEventListener(event, fn) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(f => f !== fn);
  }
  dispatchEvent(evt) {
    const handlers = this.listeners[evt.type] || [];
    for (const handler of handlers) {
      handler(evt);
    }
  }
  click() {
    this.dispatchEvent({ type: 'click', preventDefault: () => {}, stopPropagation: () => {} });
  }
  focus() {}
  blur() {}
  classList = {
    add: (c) => { if (!this.className.includes(c)) this.className = (this.className + ' ' + c).trim(); },
    remove: (c) => { this.className = this.className.replace(new RegExp(`\\b${c}\\b`, 'g'), '').trim(); },
    contains: (c) => this.className.split(/\s+/).includes(c),
    toggle: (c, force) => {
      if (force === true) this.classList.add(c);
      else if (force === false) this.classList.remove(c);
      else if (this.classList.contains(c)) this.classList.remove(c);
      else this.classList.add(c);
    }
  };
}

globalThis.document = {
  createElement: (tag) => new MockElement(tag),
  createElementNS: (_ns, tag) => new MockElement(tag, true),
  body: new MockElement('body'),
  addEventListener: () => {},
  removeEventListener: () => {}
};
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {}
};
globalThis.CustomEvent = class CustomEvent {
  constructor(name, opts = {}) {
    this.type = name;
    this.detail = opts.detail;
  }
};

test('All 21 UI primitives instantiate and conform to the component contract { element, update, destroy }', async () => {
  const ui = await import('../vendor-ui/index.mjs');

  const instances = [
    ui.Icon({ name: 'shield-check', size: 16 }),
    ui.Button({ label: 'Test Button' }),
    ui.IconButton({ icon: 'gear', label: 'Settings' }),
    ui.Toggle({ label: 'Test Toggle' }),
    ui.Checkbox({ label: 'Test Checkbox' }),
    ui.Select({ label: 'Test Select', options: [{ value: '1', label: 'One' }] }),
    ui.TextField({ label: 'Test TextField' }),
    ui.SecretField({ label: 'Test SecretField' }),
    ui.Tabs({ tabs: [{ id: '1', label: 'Tab 1' }], activeTab: '1' }),
    ui.Pill({ label: 'Test Pill' }),
    ui.Badge({ label: 'Test Badge' }),
    ui.StatusDot({ status: 'online', label: 'Online' }),
    ui.Row({ title: 'Test Row' }),
    ui.SectionHeader({ title: 'Test Header' }),
    ui.ScrollArea({ content: new MockElement('div') }),
    ui.EmptyState({ title: 'Empty', description: 'Desc' }),
    ui.Toast({ message: 'Test Toast' }),
    ui.Popover({ trigger: new MockElement('button'), content: new MockElement('div') }),
    ui.Dialog({ title: 'Test Dialog', description: 'Desc' }),
    ui.Kbd({ shortcut: 'Esc' }),
    ui.Tooltip({ target: new MockElement('button'), text: 'Hint' })
  ];

  assert.equal(instances.length, 21, 'Must have instantiated all 21 primitives');

  for (const inst of instances) {
    assert.ok(inst.element, 'Component must return element');
    assert.equal(typeof inst.update, 'function', 'Component must implement update()');
    assert.equal(typeof inst.destroy, 'function', 'Component must implement destroy()');

    // Test update and destroy lifecycle without errors
    inst.update({});
    inst.destroy();
  }
});
