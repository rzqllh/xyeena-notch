/**
 * @file apps/xyeena-island/src/ui/secret-field/secret-field.ts
 * Accessible SecretField primitive for API keys and tokens.
 * Security invariant: WebView can see the key while typing, but clears it immediately after save.
 * Stored keys are NEVER returned or stored in DOM memory.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';
import { Button } from '../button/button.js';
import { IconButton } from '../icon-button/icon-button.js';
import { Badge } from '../badge/badge.js';

export interface SecretFieldProps {
  label: string;
  isConfigured: boolean;
  storageType?: 'session' | 'keychain' | 'none';
  placeholder?: string;
  onSave: (key: string, remember: boolean) => void | Promise<void>;
  onForget: () => void | Promise<void>;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export type SecretFieldInstance = ComponentInstance<SecretFieldProps, HTMLDivElement>;

let secretIdCounter = 0;

export function SecretField(initialProps: SecretFieldProps): SecretFieldInstance {
  let currentProps: SecretFieldProps = { ...initialProps };
  const instanceId = currentProps.id || `xyn-secret-${++secretIdCounter}`;

  let isEditing = !currentProps.isConfigured;
  let isMasked = true;

  const container = document.createElement('div');
  container.className = `secret-field-wrap ${currentProps.className || ''}`.trim();

  // Header
  const header = document.createElement('div');
  header.className = 'secret-field-header';

  const labelEl = document.createElement('label');
  labelEl.htmlFor = `${instanceId}-input`;
  labelEl.className = 'secret-field-label';

  const statusWrap = document.createElement('div');
  statusWrap.className = 'secret-field-status';

  header.appendChild(labelEl);
  header.appendChild(statusWrap);
  container.appendChild(header);

  // Input Row
  const inputRow = document.createElement('div');
  inputRow.className = 'secret-field-input-row';

  const input = document.createElement('input');
  input.id = `${instanceId}-input`;
  input.type = 'password';
  input.className = 'secret-field-input';
  input.autocomplete = 'off';
  input.spellcheck = false;

  const toggleEyeBtn = IconButton({
    icon: 'eye',
    label: 'Show secret text',
    size: 'sm',
    onClick: () => {
      isMasked = !isMasked;
      input.type = isMasked ? 'password' : 'text';
      toggleEyeBtn.update({
        icon: isMasked ? 'eye' : 'eye-slash',
        label: isMasked ? 'Show secret text' : 'Hide secret text'
      });
    }
  });

  inputRow.appendChild(input);
  inputRow.appendChild(toggleEyeBtn.element);
  container.appendChild(inputRow);

  // Options & Actions
  const optionsRow = document.createElement('div');
  optionsRow.className = 'secret-field-options';

  const rememberLabel = document.createElement('label');
  rememberLabel.className = 'secret-field-remember';

  const rememberCheckbox = document.createElement('input');
  rememberCheckbox.type = 'checkbox';
  rememberCheckbox.id = `${instanceId}-remember`;

  const rememberText = document.createElement('span');
  rememberText.textContent = 'Remember on this device';

  rememberLabel.appendChild(rememberCheckbox);
  rememberLabel.appendChild(rememberText);

  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'secret-field-actions';

  const saveBtn = Button({
    label: 'Save Key',
    variant: 'primary',
    size: 'sm',
    onClick: async () => {
      const val = input.value.trim();
      if (!val) return;
      saveBtn.update({ loading: true });
      try {
        await currentProps.onSave(val, rememberCheckbox.checked);
        // CRITICAL SECURITY REQUIREMENT: Clear transient text immediately after save
        input.value = '';
        isEditing = false;
        currentProps.isConfigured = true;
        render();
      } finally {
        saveBtn.update({ loading: false });
      }
    }
  });

  const forgetBtn = Button({
    label: 'Forget',
    variant: 'ghost',
    size: 'sm',
    onClick: async () => {
      forgetBtn.update({ loading: true });
      try {
        await currentProps.onForget();
        input.value = '';
        currentProps.isConfigured = false;
        isEditing = true;
        render();
      } finally {
        forgetBtn.update({ loading: false });
      }
    }
  });

  const changeBtn = Button({
    label: 'Change Key',
    variant: 'secondary',
    size: 'sm',
    onClick: () => {
      isEditing = true;
      render();
      input.focus();
    }
  });

  optionsRow.appendChild(rememberLabel);
  optionsRow.appendChild(actionsWrap);
  container.appendChild(optionsRow);

  function render() {
    labelEl.textContent = currentProps.label;
    input.placeholder = currentProps.placeholder || 'Enter API token / secret...';

    // Status chip
    statusWrap.textContent = '';
    if (currentProps.isConfigured) {
      const badge = Badge({
        label: currentProps.storageType === 'keychain' ? 'Secured (DPAPI)' : 'Configured (Session)',
        variant: 'ok',
        icon: 'lock'
      });
      statusWrap.appendChild(badge.element);
    } else {
      const badge = Badge({
        label: 'Not Configured',
        variant: 'default'
      });
      statusWrap.appendChild(badge.element);
    }

    if (currentProps.isConfigured && !isEditing) {
      inputRow.style.display = 'none';
      rememberLabel.style.display = 'none';
      actionsWrap.textContent = '';
      actionsWrap.appendChild(changeBtn.element);
      actionsWrap.appendChild(forgetBtn.element);
    } else {
      inputRow.style.display = 'flex';
      rememberLabel.style.display = 'flex';
      actionsWrap.textContent = '';
      actionsWrap.appendChild(saveBtn.element);
      if (currentProps.isConfigured) {
        actionsWrap.appendChild(forgetBtn.element);
      }
    }
  }

  render();

  return {
    get element() {
      return container;
    },
    update(nextProps: Partial<SecretFieldProps>) {
      currentProps = { ...currentProps, ...nextProps };
      if (nextProps.isConfigured !== undefined) {
        isEditing = !nextProps.isConfigured;
      }
      render();
    },
    destroy() {
      // Clear input value to prevent memory leaks
      input.value = '';
      toggleEyeBtn.destroy();
      saveBtn.destroy();
      forgetBtn.destroy();
      changeBtn.destroy();
    }
  };
}
