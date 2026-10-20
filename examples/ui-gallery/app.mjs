/**
 * @file examples/ui-gallery/app.mjs
 * Interactive mounting script for Xyeena Island UI Primitives Gallery.
 * Renders all 21 primitives across all variants and interactive states.
 */

import {
  Icon,
  Button,
  IconButton,
  Toggle,
  Checkbox,
  Select,
  TextField,
  SecretField,
  Tabs,
  Pill,
  Badge,
  StatusDot,
  Row,
  SectionHeader,
  ScrollArea,
  EmptyState,
  Toast,
  Popover,
  Dialog,
  Kbd,
  Tooltip,
  CANONICAL_ICON_NAMES
} from './vendor-ui/index.mjs';

// ============================================================================
// 1. TOOLBAR CONTROLS (Theme, Scale, Motion, RTL)
// ============================================================================

const themeSelect = document.getElementById('theme-select');
if (themeSelect) {
  themeSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', val);
    }
  });
}

const scaleBtns = document.querySelectorAll('.gallery-btn-scale');
scaleBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const scale = btn.getAttribute('data-scale-val');
    document.body.setAttribute('data-scale', scale);
    scaleBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

const motionToggle = document.getElementById('motion-toggle');
if (motionToggle) {
  motionToggle.addEventListener('change', (e) => {
    document.body.setAttribute('data-reduced-motion', e.target.checked ? 'true' : 'false');
  });
}

const rtlToggle = document.getElementById('rtl-toggle');
if (rtlToggle) {
  rtlToggle.addEventListener('change', (e) => {
    document.documentElement.setAttribute('dir', e.target.checked ? 'rtl' : 'ltr');
  });
}

// ============================================================================
// 2. TOKEN SWATCHES
// ============================================================================

const tokenSwatchesContainer = document.getElementById('token-swatches');
if (tokenSwatchesContainer) {
  const tokens = [
    { name: '--surface-0', role: 'Base Background' },
    { name: '--surface-1', role: 'Panel / Card Surface' },
    { name: '--surface-2', role: 'Hover / Sub-surface' },
    { name: '--text-1', role: 'Primary Typography' },
    { name: '--text-2', role: 'Secondary Typography' },
    { name: '--text-3', role: 'Muted Typography' },
    { name: '--line', role: 'Border & Separators' },
    { name: '--accent', role: 'Xyeena Brand Accent' },
    { name: '--state-ok', role: 'Success / Approved' },
    { name: '--state-warn', role: 'Warning / Review' },
    { name: '--state-danger', role: 'Error / Rejected' },
    { name: '--state-info', role: 'Informational' }
  ];

  tokens.forEach(({ name, role }) => {
    const swatch = document.createElement('div');
    swatch.className = 'token-swatch';

    const colorBox = document.createElement('div');
    colorBox.className = 'swatch-color';
    colorBox.style.backgroundColor = `var(${name})`;

    const labelName = document.createElement('span');
    labelName.className = 'swatch-name';
    labelName.textContent = name;

    const labelRole = document.createElement('span');
    labelRole.className = 'swatch-hex';
    labelRole.textContent = role;

    swatch.appendChild(colorBox);
    swatch.appendChild(labelName);
    swatch.appendChild(labelRole);
    tokenSwatchesContainer.appendChild(swatch);
  });
}

// ============================================================================
// 3. ICON REGISTRY GRID
// ============================================================================

const iconGrid = document.getElementById('icon-registry-grid');
if (iconGrid && Array.isArray(CANONICAL_ICON_NAMES)) {
  CANONICAL_ICON_NAMES.forEach((name) => {
    const cell = document.createElement('div');
    cell.className = 'icon-cell';

    const iconInst = Icon({ name, size: 20 });
    const nameEl = document.createElement('span');
    nameEl.className = 'icon-name';
    nameEl.textContent = name;

    cell.appendChild(iconInst.element);
    cell.appendChild(nameEl);
    iconGrid.appendChild(cell);
  });
}

// ============================================================================
// 4. MOUNT 21 PRIMITIVES
// ============================================================================

function mountDemo(id, ...elements) {
  const container = document.getElementById(id);
  if (!container) return;
  const grid = document.createElement('div');
  grid.className = 'gallery-grid';

  elements.forEach((el) => {
    if (Array.isArray(el)) {
      const row = document.createElement('div');
      row.className = 'gallery-row';
      el.forEach(child => row.appendChild(child.element || child));
      grid.appendChild(row);
    } else {
      grid.appendChild(el.element || el);
    }
  });

  container.appendChild(grid);
}

// 1. Icon
mountDemo('demo-icon', [
  Icon({ name: 'shield-check', size: 16 }),
  Icon({ name: 'shield-check', size: 20 }),
  Icon({ name: 'shield-check', size: 24 }),
  Icon({ name: 'sparkle', size: 20 }),
  Icon({ name: 'bell', size: 20, label: 'Notifications' })
]);

// 2. Button
mountDemo('demo-button',
  [
    Button({ label: 'Primary Action', variant: 'primary' }),
    Button({ label: 'Secondary Action', variant: 'secondary' }),
    Button({ label: 'Ghost Action', variant: 'ghost' }),
    Button({ label: 'Danger Action', variant: 'danger' })
  ],
  [
    Button({ label: 'Small', size: 'sm', variant: 'secondary' }),
    Button({ label: 'Medium', size: 'md', variant: 'secondary' }),
    Button({ label: 'Large', size: 'lg', variant: 'secondary' })
  ],
  [
    Button({ label: 'Processing...', variant: 'primary', loading: true }),
    Button({
      label: 'Disabled Action',
      variant: 'secondary',
      disabled: true,
      disabledReason: 'Requires agent session approval'
    })
  ]
);

// 3. IconButton
mountDemo('demo-icon-button', [
  IconButton({ icon: 'gear', label: 'Open Settings', size: 'sm' }),
  IconButton({ icon: 'gear', label: 'Open Settings', size: 'md' }),
  IconButton({ icon: 'gear', label: 'Open Settings', size: 'lg' }),
  IconButton({ icon: 'copy', label: 'Copy to Clipboard', variant: 'ghost' }),
  IconButton({ icon: 'trash', label: 'Delete Item', variant: 'ghost' })
]);

// 4. Toggle
mountDemo('demo-toggle', [
  Toggle({ label: 'Sound Effects', checked: false }),
  Toggle({ label: 'Desktop Notifications', checked: true }),
  Toggle({ label: 'Experimental Relay (Disabled)', disabled: true, checked: false })
]);

// 5. Checkbox
mountDemo('demo-checkbox', [
  Checkbox({ label: 'Auto-start on Windows boot', checked: false }),
  Checkbox({ label: 'Live clipboard synchronization', checked: true }),
  Checkbox({ label: 'Select all connected sessions', indeterminate: true }),
  Checkbox({ label: 'Hardware acceleration (Disabled)', disabled: true, checked: true })
]);

// 6. Select
mountDemo('demo-select', [
  Select({
    label: 'Language',
    options: [
      { value: 'id', label: 'Bahasa Indonesia' },
      { value: 'en', label: 'English' }
    ],
    value: 'id'
  }),
  Select({
    label: 'AI Provider',
    options: [
      { value: 'anthropic', label: 'Anthropic Claude' },
      { value: 'openai', label: 'OpenAI GPT-4' }
    ],
    value: 'anthropic',
    disabled: true
  })
]);

// 7. TextField
mountDemo('demo-text-field',
  [
    TextField({
      label: 'Workspace Name',
      placeholder: 'e.g. My Workspace',
      value: 'xyeena-island'
    }),
    TextField({
      label: 'Server Port',
      value: '4181',
      helperText: 'Valid range: 1024 - 65535'
    })
  ],
  [
    TextField({
      label: 'Branch Ref',
      value: 'invalid branch!',
      error: 'Branch name contains illegal characters'
    }),
    TextField({
      label: 'App ID (Read-only)',
      value: 'com.xyeena.notch',
      disabled: true
    })
  ]
);

// 8. SecretField
mountDemo('demo-secret-field', [
  SecretField({
    label: 'Anthropic Claude API Key',
    placeholder: 'sk-ant-api03-...',
    helperText: 'Encrypted via OS Credential Vault. Never stored in browser DOM.'
  })
]);

// 9. Tabs
const tabsInstance = Tabs({
  tabs: [
    { id: 'tab-overview', label: 'Overview' },
    { id: 'tab-activity', label: 'Activity' },
    { id: 'tab-diagnostics', label: 'Diagnostics' }
  ],
  activeTab: 'tab-overview',
  onChange: (tabId) => {
    tabContent.textContent = `Active tab panel: ${tabId}`;
  }
});
const tabContent = document.createElement('div');
tabContent.className = 'gallery-demo-box';
tabContent.textContent = 'Active tab panel: tab-overview';
mountDemo('demo-tabs', tabsInstance, tabContent);

// 10. Pill
mountDemo('demo-pill', [
  Pill({ label: 'Idle' }),
  Pill({ label: 'Running', active: true }),
  Pill({ label: 'Filter: Claude', closable: true, onClose: () => {} }),
  Pill({ label: 'Archived', disabled: true })
]);

// 11. Badge
mountDemo('demo-badge', [
  Badge({ label: 'Neutral', variant: 'neutral' }),
  Badge({ label: 'Active', variant: 'accent' }),
  Badge({ label: 'Approved', variant: 'success' }),
  Badge({ label: 'Pending', variant: 'warn' }),
  Badge({ label: 'Rejected', variant: 'danger' })
]);

// 12. StatusDot
mountDemo('demo-status-dot', [
  StatusDot({ status: 'online', label: 'Connected' }),
  StatusDot({ status: 'away', label: 'Idle' }),
  StatusDot({ status: 'busy', label: 'Executing' }),
  StatusDot({ status: 'offline', label: 'Disconnected' })
]);

// 13. Row
const rowActionBtn1 = Button({ label: 'Inspect', variant: 'secondary', size: 'sm' });
const rowActionBtn2 = Button({ label: 'Revoke', variant: 'ghost', size: 'sm' });
mountDemo('demo-row',
  Row({
    icon: 'sparkle',
    title: 'Code Review Agent',
    subtitle: 'Claude 3.7 Sonnet · monitoring pull requests on main',
    action: rowActionBtn1.element
  }),
  Row({
    icon: 'terminal',
    title: 'Background Shell Worker',
    subtitle: 'PID 10442 · running cargo test --locked',
    action: rowActionBtn2.element
  })
);

// 14. SectionHeader
const sectionActionBtn = Button({ label: 'Scan Agents', variant: 'secondary', size: 'sm' });
mountDemo('demo-section-header',
  SectionHeader({
    title: 'Active Agents & Sessions',
    description: 'Real-time telemetry from detected IDE and CLI agents.',
    action: sectionActionBtn.element
  })
);

// 15. ScrollArea
const scrollableList = document.createElement('div');
for (let i = 1; i <= 8; i++) {
  const rowItem = Row({
    icon: 'file',
    title: `Telemetry Record #${i}`,
    subtitle: `Dispatched tool action payload ${i * 42} bytes`
  });
  scrollableList.appendChild(rowItem.element);
}
const scrollAreaInstance = ScrollArea({
  content: scrollableList,
  maxHeight: '140px'
});
mountDemo('demo-scroll-area', scrollAreaInstance);

// 16. EmptyState
const emptyActionBtn = Button({ label: 'View Audit Ledger', variant: 'secondary' });
mountDemo('demo-empty-state',
  EmptyState({
    icon: 'check-circle',
    title: 'No Pending Approvals',
    description: 'All pending tool executions and security boundary requests have been resolved.',
    action: emptyActionBtn.element
  })
);

// 17. Toast
const toastContainer = document.createElement('div');
const toastInfoBtn = Button({
  label: 'Trigger Info Toast',
  variant: 'secondary',
  size: 'sm',
  onClick: () => {
    const t = Toast({
      message: 'New session connected: Claude Code CLI',
      variant: 'info'
    });
    toastContainer.appendChild(t.element);
  }
});
const toastSuccessBtn = Button({
  label: 'Trigger Success Toast',
  variant: 'secondary',
  size: 'sm',
  onClick: () => {
    const t = Toast({
      message: 'Action approved successfully',
      variant: 'success'
    });
    toastContainer.appendChild(t.element);
  }
});
mountDemo('demo-toast', [toastInfoBtn, toastSuccessBtn], toastContainer);

// 18. Popover
const popoverContent = document.createElement('div');
popoverContent.className = 'gallery-demo-box';
popoverContent.textContent = 'Contextual overlay actions';

const popoverAnchor = Button({ label: 'Toggle Popover', variant: 'secondary' });
const popoverInstance = Popover({
  trigger: popoverAnchor.element,
  content: popoverContent
});
mountDemo('demo-popover', popoverInstance);

// 19. Dialog
const dialogInstance = Dialog({
  title: 'Confirm Tool Execution',
  description: 'Claude Code requests permission to run `cargo test --locked` on your system.',
  confirmLabel: 'Approve',
  cancelLabel: 'Deny',
  onConfirm: () => dialogInstance.close(),
  onCancel: () => dialogInstance.close()
});
const openDialogBtn = Button({
  label: 'Open Approval Dialog',
  variant: 'primary',
  onClick: () => dialogInstance.open()
});
mountDemo('demo-dialog', openDialogBtn, dialogInstance);

// 20. Kbd
mountDemo('demo-kbd', [
  Kbd({ shortcut: 'Esc' }),
  Kbd({ shortcut: 'Ctrl+Shift+P' }),
  Kbd({ shortcut: 'Alt+Enter' }),
  Kbd({ shortcut: 'Cmd+K' })
]);

// 21. Tooltip
const tooltipTargetBtn = Button({ label: 'Hover for Tooltip', variant: 'ghost' });
const tooltipInstance = Tooltip({
  text: 'Quick access shortcut: Ctrl + Shift + Space',
  target: tooltipTargetBtn.element
});
mountDemo('demo-tooltip', tooltipTargetBtn, tooltipInstance);
