/**
 * @file apps/xyeena-island/src/ui/text-field/text-field.ts
 * Accessible TextField primitive with label, placeholder, error message, and keyboard support.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';
import { Icon, type IconInstance } from '../icon/icon.js';
import type { IconName } from '../icon/registry.generated.js';

export interface TextFieldProps {
  label?: string;
  value: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  onEnter?: (value: string) => void;
  disabled?: boolean;
  id?: string;
  type?: 'text' | 'search' | 'url' | 'number';
  error?: string;
  icon?: IconName | string;
  className?: string;
  ariaLabel?: string;
}

export type TextFieldInstance = ComponentInstance<TextFieldProps, HTMLDivElement>;

let textFieldIdCounter = 0;

export function TextField(initialProps: TextFieldProps): TextFieldInstance {
  let currentProps: TextFieldProps = { ...initialProps };
  const instanceId = currentProps.id || `xyn-textfield-${++textFieldIdCounter}`;

  const container = document.createElement('div');
  container.className = `text-field-wrap ${currentProps.className || ''}`.trim();

  const labelEl = document.createElement('label');
  labelEl.htmlFor = instanceId;
  labelEl.className = 'text-field-label';

  const box = document.createElement('div');
  box.className = 'text-field-box';

  let iconWrap: HTMLSpanElement | null = null;
  let iconInstance: IconInstance | null = null;

  const input = document.createElement('input');
  input.type = currentProps.type || 'text';
  input.id = instanceId;
  input.className = 'text-field-input';

  const errorEl = document.createElement('p');
  errorEl.id = `${instanceId}-error`;
  errorEl.className = 'text-field-error';

  box.appendChild(input);

  let inputHandler: ((e: Event) => void) | null = null;
  let keyHandler: ((e: KeyboardEvent) => void) | null = null;

  function render() {
    if (currentProps.label) {
      labelEl.textContent = currentProps.label;
      if (!container.contains(labelEl)) {
        container.insertBefore(labelEl, box);
      }
    } else {
      if (container.contains(labelEl)) {
        container.removeChild(labelEl);
      }
      if (currentProps.ariaLabel) {
        input.setAttribute('aria-label', currentProps.ariaLabel);
      }
    }

    input.value = currentProps.value || '';
    input.placeholder = currentProps.placeholder || '';
    input.disabled = !!currentProps.disabled;
    input.type = currentProps.type || 'text';

    if (currentProps.icon) {
      if (!iconWrap) {
        iconWrap = document.createElement('span');
        iconWrap.className = 'text-field-icon';
        box.insertBefore(iconWrap, input);
      }
      if (!iconInstance) {
        iconInstance = Icon({ name: currentProps.icon, size: 14 });
        iconWrap.appendChild(iconInstance.element);
      } else {
        iconInstance.update({ name: currentProps.icon });
      }
    } else if (iconWrap) {
      iconInstance?.destroy();
      iconInstance = null;
      if (box.contains(iconWrap)) {
        box.removeChild(iconWrap);
      }
      iconWrap = null;
    }

    if (currentProps.error) {
      box.classList.add('error');
      errorEl.textContent = currentProps.error;
      if (!container.contains(errorEl)) {
        container.appendChild(errorEl);
      }
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', errorEl.id);
    } else {
      box.classList.remove('error');
      if (container.contains(errorEl)) {
        container.removeChild(errorEl);
      }
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
  }

  function setupEvents() {
    if (inputHandler) input.removeEventListener('input', inputHandler);
    if (keyHandler) input.removeEventListener('keydown', keyHandler);

    inputHandler = (e: Event) => {
      const val = (e.target as HTMLInputElement).value;
      currentProps.value = val;
      currentProps.onChange?.(val);
    };

    keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        currentProps.onEnter?.(input.value);
      }
    };

    input.addEventListener('input', inputHandler);
    input.addEventListener('keydown', keyHandler);
  }

  if (!container.contains(box)) {
    container.appendChild(box);
  }

  render();
  setupEvents();

  return {
    get element() {
      return container;
    },
    update(nextProps: Partial<TextFieldProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      if (inputHandler) {
        input.removeEventListener('input', inputHandler);
        inputHandler = null;
      }
      if (keyHandler) {
        input.removeEventListener('keydown', keyHandler);
        keyHandler = null;
      }
      iconInstance?.destroy();
      iconInstance = null;
    }
  };
}
