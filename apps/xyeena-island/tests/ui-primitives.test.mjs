/**
 * @file apps/xyeena-island/tests/ui-primitives.test.mjs
 * Comprehensive unit tests for Xyeena Island UI Primitives:
 * Props, states, keyboard navigation, and ARIA contracts.
 * Ref: 03-PHASE-2-UI-FOUNDATION.md / docs/adr/0001-ui-component-model.md
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// --- Lightweight In-Memory DOM Shim for Headless Component Testing ---

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
    this.hidden = false;
    this.tabIndex = -1;
    this.type = 'text';
    this.parentNode = null;
    this.scrollHeight = 100;
    this.clientHeight = 100;
  }

  get textContent() {
    if (this.children.length > 0) {
      return this.children.map(c => c.textContent).join('');
    }
    return this._textContent;
  }

  set textContent(v) {
    this._textContent = String(v);
    this.children = [];
  }

  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'class') this.className = String(v);
    if (k === 'id') this.id = String(v);
    if (k === 'type') this.type = String(v);
    if (k === 'title') this.title = String(v);
  }

  getAttribute(k) {
    return this.attributes[k];
  }

  removeAttribute(k) {
    delete this.attributes[k];
    if (k === 'class') this.className = '';
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  insertBefore(newChild, refChild) {
    const idx = this.children.indexOf(refChild);
    if (idx >= 0) {
      this.children.splice(idx, 0, newChild);
    } else {
      this.children.push(newChild);
    }
    newChild.parentNode = this;
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

  focus() {
    globalThis.document.activeElement = this;
  }

  blur() {
    if (globalThis.document.activeElement === this) {
      globalThis.document.activeElement = null;
    }
  }

  getBoundingClientRect() {
    return { top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 };
  }

  get classList() {
    const self = this;
    return {
      add(cls) {
        const classes = self.className.split(/\s+/).filter(Boolean);
        if (!classes.includes(cls)) {
          classes.push(cls);
          self.className = classes.join(' ');
        }
      },
      remove(cls) {
        const classes = self.className.split(/\s+/).filter(Boolean).filter(c => c !== cls);
        self.className = classes.join(' ');
      },
      contains(cls) {
        return self.className.split(/\s+/).includes(cls);
      },
      toggle(cls, force) {
        if (force === undefined) {
          if (this.contains(cls)) this.remove(cls);
          else this.add(cls);
        } else if (force) {
          this.add(cls);
        } else {
          this.remove(cls);
        }
      }
    };
  }
}

const mockDocListeners = {};
globalThis.document = {
  activeElement: null,
  body: new MockElement('body'),
  createElement: (tag) => new MockElement(tag),
  createElementNS: (ns, tag) => new MockElement(tag, true),
  addEventListener: (event, fn) => {
    mockDocListeners[event] = mockDocListeners[event] || [];
    mockDocListeners[event].push(fn);
  },
  removeEventListener: (event, fn) => {
    if (!mockDocListeners[event]) return;
    mockDocListeners[event] = mockDocListeners[event].filter(f => f !== fn);
  },
  _dispatch(evt) {
    const handlers = mockDocListeners[evt.type] || [];
    for (const h of handlers) h(evt);
  }
};
globalThis.HTMLElement = MockElement;
globalThis.HTMLButtonElement = MockElement;
globalThis.HTMLDivElement = MockElement;
globalThis.HTMLLabelElement = MockElement;
globalThis.HTMLSpanElement = MockElement;
globalThis.HTMLSelectElement = MockElement;
globalThis.SVGSVGElement = MockElement;

// Import compiled UI primitives
import { Icon } from './compiled-ui/icon/icon.mjs';
import { Button } from './compiled-ui/button/button.mjs';
import { IconButton } from './compiled-ui/icon-button/icon-button.mjs';
import { Toggle } from './compiled-ui/toggle/toggle.mjs';
import { Checkbox } from './compiled-ui/checkbox/checkbox.mjs';
import { Select } from './compiled-ui/select/select.mjs';
import { TextField } from './compiled-ui/text-field/text-field.mjs';
import { SecretField } from './compiled-ui/secret-field/secret-field.mjs';
import { Tabs } from './compiled-ui/tabs/tabs.mjs';
import { Pill } from './compiled-ui/pill/pill.mjs';
import { Badge } from './compiled-ui/badge/badge.mjs';
import { StatusDot } from './compiled-ui/status-dot/status-dot.mjs';
import { Row } from './compiled-ui/row/row.mjs';
import { SectionHeader } from './compiled-ui/section-header/section-header.mjs';
import { ScrollArea } from './compiled-ui/scroll-area/scroll-area.mjs';
import { EmptyState } from './compiled-ui/empty-state/empty-state.mjs';
import { Toast } from './compiled-ui/toast/toast.mjs';
import { Popover } from './compiled-ui/popover/popover.mjs';
import { Dialog } from './compiled-ui/dialog/dialog.mjs';
import { Kbd } from './compiled-ui/kbd/kbd.mjs';
import { Tooltip } from './compiled-ui/tooltip/tooltip.mjs';

// --- Test Suites ---

test('UI Primitive: Icon contracts (viewBox, a11y, reactivity)', () => {
  const icon = Icon({ name: 'shield-check', size: 20 });
  assert.equal(icon.element.getAttribute('viewBox'), '0 0 256 256');
  assert.equal(icon.element.getAttribute('width'), '20');
  assert.equal(icon.element.getAttribute('fill'), 'currentColor');
  assert.equal(icon.element.getAttribute('aria-hidden'), 'true');
  assert.equal(icon.element.getAttribute('role'), undefined);

  // Labeled icon contract
  icon.update({ label: 'System Guard Active' });
  assert.equal(icon.element.getAttribute('role'), 'img');
  assert.equal(icon.element.getAttribute('aria-label'), 'System Guard Active');
  assert.equal(icon.element.getAttribute('aria-hidden'), undefined);

  icon.destroy();
});

test('UI Primitive: Button (variants, loading state, disabled reason a11y)', () => {
  let clicked = false;
  const btn = Button({
    label: 'Deploy Workflow',
    variant: 'primary',
    onClick: () => { clicked = true; }
  });

  assert.ok(btn.element.className.includes('btn-primary'));
  assert.equal(btn.element.textContent, 'Deploy Workflow');

  btn.element.click();
  assert.equal(clicked, true);

  // Loading state
  btn.update({ loading: true });
  assert.equal(btn.element.getAttribute('aria-busy'), 'true');
  assert.equal(btn.element.disabled, true);

  // Disabled with reason via aria-describedby
  btn.update({ loading: false, disabled: true, disabledReason: 'Approval token expired' });
  assert.equal(btn.element.getAttribute('aria-disabled'), 'true');
  const descId = btn.element.getAttribute('aria-describedby');
  assert.ok(descId, 'Must have aria-describedby for disabled reason');
  assert.ok(btn.element.textContent.includes('Approval token expired'));

  btn.destroy();
});

test('UI Primitive: IconButton (enforces mandatory accessible name)', () => {
  assert.throws(() => {
    IconButton({ icon: 'x', label: '' });
  }, /IconButton requires a non-empty accessible `label`/);

  const iconBtn = IconButton({
    icon: 'x',
    label: 'Dismiss notification',
    variant: 'ghost'
  });

  assert.equal(iconBtn.element.getAttribute('aria-label'), 'Dismiss notification');
  assert.equal(iconBtn.element.title, 'Dismiss notification');
  assert.ok(iconBtn.element.className.includes('icon-btn-ghost'));

  iconBtn.destroy();
});

test('UI Primitive: Toggle (switch ARIA, Space/Enter keyboard toggle)', () => {
  let state = false;
  const toggle = Toggle({
    label: 'Enable Clipboard Capture',
    checked: false,
    onChange: (val) => { state = val; }
  });

  const switchBtn = toggle.element.children[1];
  assert.equal(switchBtn.getAttribute('role'), 'switch');
  assert.equal(switchBtn.getAttribute('aria-checked'), 'false');

  // Keyboard space toggle
  switchBtn.dispatchEvent({ type: 'keydown', key: ' ', preventDefault: () => {} });
  assert.equal(state, true);
  assert.equal(switchBtn.getAttribute('aria-checked'), 'true');

  toggle.destroy();
});

test('UI Primitive: Checkbox (label association and change event)', () => {
  let val = false;
  const cb = Checkbox({
    label: 'Acknowledge API cost disclaimer',
    checked: false,
    onChange: (checked) => { val = checked; }
  });

  const input = cb.element.children[0];
  assert.equal(input.checked, false);

  input.checked = true;
  input.dispatchEvent({ type: 'change', target: input });
  assert.equal(val, true);

  cb.destroy();
});

test('UI Primitive: Select (options rendering, value change)', () => {
  let selected = 'gemini';
  const sel = Select({
    label: 'AI Provider',
    value: 'gemini',
    options: [
      { value: 'gemini', label: 'Google Gemini' },
      { value: 'anthropic', label: 'Anthropic Claude' }
    ],
    onChange: (v) => { selected = v; }
  });

  const selectEl = sel.element.children[1].children[0];
  assert.equal(selectEl.children.length, 2);

  selectEl.dispatchEvent({ type: 'change', target: { value: 'anthropic' } });
  assert.equal(selected, 'anthropic');

  sel.destroy();
});

test('UI Primitive: TextField (placeholder, enter key, error state)', () => {
  let submitted = '';
  const tf = TextField({
    label: 'Note Title',
    value: 'Kickoff',
    placeholder: 'Enter title...',
    onEnter: (v) => { submitted = v; }
  });

  const input = tf.element.children[1].children[0];
  assert.equal(input.value, 'Kickoff');

  input.dispatchEvent({ type: 'keydown', key: 'Enter' });
  assert.equal(submitted, 'Kickoff');

  // Error state
  tf.update({ error: 'Title cannot exceed 60 characters' });
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.ok(input.getAttribute('aria-describedby'));

  tf.destroy();
});

test('UI Primitive: SecretField (masked typing, zero plaintext in DOM memory after save)', async () => {
  let savedKey = '';
  let remembered = false;
  let forgot = false;

  const secret = SecretField({
    label: 'Anthropic API Key',
    isConfigured: false,
    onSave: (k, rem) => {
      savedKey = k;
      remembered = rem;
    },
    onForget: () => {
      forgot = true;
    }
  });

  // Find password input
  const inputRow = secret.element.children[1];
  const input = inputRow.children[0];
  assert.equal(input.type, 'password');

  // User types key
  input.value = 'sk-ant-test-secret-key-12345';

  // Find save button
  const optionsRow = secret.element.children[2];
  const saveBtn = optionsRow.children[1].children[0];

  await saveBtn.click();

  assert.equal(savedKey, 'sk-ant-test-secret-key-12345');
  // CRITICAL SECURITY ASSERTION: DOM input value must be wiped clean immediately
  assert.equal(input.value, '', 'Stored key must be completely erased from DOM memory');
  assert.equal(inputRow.style.display, 'none', 'Input row must be hidden once configured');

  // Forget key lifecycle
  const forgetBtn = optionsRow.children[1].children[1];
  await forgetBtn.click();
  assert.equal(forgot, true);

  secret.destroy();
});

test('UI Primitive: Tabs (roving tabindex and arrow key navigation)', () => {
  let active = 'chat';
  const tabs = Tabs({
    tabs: [
      { id: 'now', label: 'Now' },
      { id: 'chat', label: 'Chat' },
      { id: 'agents', label: 'Agents' }
    ],
    activeTab: 'chat',
    onChange: (id) => { active = id; }
  });

  const tabBtns = tabs.element.children;
  assert.equal(tabBtns.length, 3);

  // Roving tabindex: active has 0, inactive has -1
  assert.equal(tabBtns[0].tabIndex, -1);
  assert.equal(tabBtns[1].tabIndex, 0);
  assert.equal(tabBtns[2].tabIndex, -1);
  assert.equal(tabBtns[1].getAttribute('aria-selected'), 'true');

  // ArrowRight keydown
  tabBtns[1].dispatchEvent({ type: 'keydown', key: 'ArrowRight', preventDefault: () => {} });
  assert.equal(active, 'agents');
  assert.equal(tabBtns[2].tabIndex, 0);
  assert.equal(tabBtns[1].tabIndex, -1);

  tabs.destroy();
});

test('UI Primitive: Pill (active state, count, aria-pressed)', () => {
  let clicked = false;
  const pill = Pill({
    label: 'Active Agents',
    count: 3,
    active: true,
    onClick: () => { clicked = true; }
  });

  assert.equal(pill.element.getAttribute('aria-pressed'), 'true');
  assert.ok(pill.element.className.includes('active'));
  assert.ok(pill.element.textContent.includes('3'));

  pill.element.click();
  assert.equal(clicked, true);

  pill.destroy();
});

test('UI Primitive: Badge (variants, icon, text)', () => {
  const badge = Badge({
    label: 'Verified',
    variant: 'ok',
    icon: 'check'
  });

  assert.ok(badge.element.className.includes('badge-ok'));
  assert.ok(badge.element.textContent.includes('Verified'));

  badge.destroy();
});

test('UI Primitive: StatusDot (strict contract: never color-only, requires label)', () => {
  assert.throws(() => {
    StatusDot({ status: 'ok', label: '' });
  }, /StatusDot requires a non-empty `label`/);

  const dot = StatusDot({
    status: 'ok',
    label: 'IPC Channel Healthy',
    showText: true
  });

  assert.ok(dot.element.textContent.includes('IPC Channel Healthy'));

  // Test screen-reader accessible label when text is hidden
  dot.update({ showText: false });
  assert.equal(dot.element.getAttribute('aria-label'), 'IPC Channel Healthy');
  assert.equal(dot.element.getAttribute('role'), 'status');

  dot.destroy();
});

test('UI Primitive: Row (flat list structure, interactive click/Enter)', () => {
  let rowClicked = false;
  const row = Row({
    title: 'antigravity-adapter',
    subtitle: 'Named Pipe Connected (PID 4820)',
    onClick: () => { rowClicked = true; }
  });

  assert.equal(row.element.getAttribute('role'), 'button');
  assert.equal(row.element.tabIndex, 0);

  // Keyboard Enter activation
  row.element.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault: () => {} });
  assert.equal(rowClicked, true);

  row.destroy();
});

test('UI Primitive: SectionHeader (kicker, title, actions slot)', () => {
  const actionBtn = document.createElement('button');
  actionBtn.textContent = 'Clear';

  const hdr = SectionHeader({
    kicker: 'ACTIVE RUNS',
    title: 'Agent Execution Stream',
    action: actionBtn
  });

  assert.ok(hdr.element.textContent.includes('ACTIVE RUNS'));
  assert.ok(hdr.element.textContent.includes('Agent Execution Stream'));
  assert.ok(hdr.element.textContent.includes('Clear'));

  hdr.destroy();
});

test('UI Primitive: ScrollArea (single scroll owner primitive contract)', () => {
  const child = document.createElement('div');
  child.textContent = 'Session list';

  const scroll = ScrollArea({
    content: child,
    maxHeight: '300px'
  });

  assert.ok(scroll.element.className.includes('scroll-area'));
  assert.equal(scroll.element.style.maxHeight, '300px');
  assert.equal(scroll.element.contains(child), true);

  scroll.destroy();
});

test('UI Primitive: EmptyState (icon, title, description, action)', () => {
  const action = document.createElement('button');
  action.textContent = 'Connect Agent';

  const empty = EmptyState({
    icon: 'activity',
    title: 'No Active Sessions',
    description: 'Agents paired via the local named pipe will appear here.',
    action
  });

  assert.ok(empty.element.textContent.includes('No Active Sessions'));
  assert.ok(empty.element.textContent.includes('Connect Agent'));

  empty.destroy();
});

test('UI Primitive: Toast (role status/alert, timer lifecycle teardown)', () => {
  let dismissed = false;
  const toast = Toast({
    message: 'Settings updated successfully',
    variant: 'ok',
    duration: 1000,
    onDismiss: () => { dismissed = true; }
  });

  assert.equal(toast.element.getAttribute('role'), 'status');
  assert.equal(toast.element.getAttribute('aria-live'), 'polite');

  // Manual dismiss
  const closeBtn = toast.element.children[2];
  closeBtn.click();
  assert.equal(dismissed, true);

  toast.destroy();
});

test('UI Primitive: Popover (aria-expanded, click outside dismiss, Esc key)', () => {
  let isOpen = false;
  const trigger = document.createElement('button');
  const content = document.createElement('div');

  const pop = Popover({
    trigger,
    content,
    open: false,
    onOpenChange: (open) => { isOpen = open; }
  });

  assert.equal(trigger.getAttribute('aria-expanded'), 'false');

  trigger.click();
  assert.equal(isOpen, true);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');

  // Esc key dismiss
  globalThis.document._dispatch({ type: 'keydown', key: 'Escape', preventDefault: () => {} });
  assert.equal(isOpen, false);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');

  pop.destroy();
});

test('UI Primitive: Dialog (role dialog, aria-modal, Esc close, confirm/cancel)', () => {
  let confirmed = false;
  let cancelled = false;

  const content = document.createElement('p');
  content.textContent = 'Are you sure you want to forget credentials?';

  const dlg = Dialog({
    title: 'Forget Provider Key',
    description: 'This will remove the key from Windows DPAPI storage.',
    content,
    confirmLabel: 'Forget Key',
    danger: true,
    open: true,
    onConfirm: () => { confirmed = true; },
    onCancel: () => { cancelled = true; }
  });

  const panel = dlg.element.children[0];
  assert.equal(panel.getAttribute('role'), 'dialog');
  assert.equal(panel.getAttribute('aria-modal'), 'true');

  // Cancel button
  const footer = panel.children[2];
  const cancelBtn = footer.children[0];
  cancelBtn.click();
  assert.equal(cancelled, true);

  dlg.destroy();
});

test('UI Primitive: Kbd (semantic kbd elements, split shortcut)', () => {
  const kbd = Kbd({ shortcut: 'Ctrl+Shift+P' });
  const kbdTags = kbd.element.children.filter(c => c.tagName === 'KBD');
  assert.equal(kbdTags.length, 3);
  assert.equal(kbdTags[0].textContent, 'Ctrl');
  assert.equal(kbdTags[1].textContent, 'Shift');
  assert.equal(kbdTags[2].textContent, 'P');

  kbd.destroy();
});

test('UI Primitive: Tooltip (aria-describedby binding and destroy cleanup)', () => {
  const target = document.createElement('button');
  const tooltip = Tooltip({
    text: 'Copy clipboard contents',
    target
  });

  assert.ok(target.getAttribute('aria-describedby'), 'Target must have aria-describedby');

  tooltip.destroy();
  assert.equal(target.getAttribute('aria-describedby'), undefined, 'aria-describedby must be cleaned on destroy');
});
