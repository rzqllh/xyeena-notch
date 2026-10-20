/**
 * @file apps/xyeena-island/src/ui/checkbox/checkbox.ts
 * Accessible Checkbox primitive using semantic HTML input with label associations.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  description?: string;
  className?: string;
}

export type CheckboxInstance = ComponentInstance<CheckboxProps, HTMLLabelElement>;

let checkboxIdCounter = 0;

export function Checkbox(initialProps: CheckboxProps): CheckboxInstance {
  let currentProps: CheckboxProps = { ...initialProps };
  const instanceId = currentProps.id || `xyn-checkbox-${++checkboxIdCounter}`;

  const labelWrapper = document.createElement('label');
  labelWrapper.className = `checkbox-wrap ${currentProps.className || ''}`.trim();

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = instanceId;
  input.className = 'checkbox-input';

  const textWrap = document.createElement('div');
  textWrap.className = 'checkbox-text';

  const labelSpan = document.createElement('span');
  labelSpan.className = 'checkbox-label';

  const descSpan = document.createElement('span');
  descSpan.id = `${instanceId}-desc`;
  descSpan.className = 'checkbox-desc';

  textWrap.appendChild(labelSpan);

  labelWrapper.appendChild(input);
  labelWrapper.appendChild(textWrap);

  let changeHandler: ((e: Event) => void) | null = null;

  function render() {
    input.checked = !!currentProps.checked;
    input.disabled = !!currentProps.disabled;

    if (currentProps.disabled) {
      labelWrapper.classList.add('disabled');
      input.setAttribute('aria-disabled', 'true');
    } else {
      labelWrapper.classList.remove('disabled');
      input.removeAttribute('aria-disabled');
    }

    labelSpan.textContent = currentProps.label;

    if (currentProps.description) {
      descSpan.textContent = currentProps.description;
      if (!textWrap.contains(descSpan)) {
        textWrap.appendChild(descSpan);
      }
      input.setAttribute('aria-describedby', descSpan.id);
    } else {
      if (textWrap.contains(descSpan)) {
        textWrap.removeChild(descSpan);
      }
      input.removeAttribute('aria-describedby');
    }
  }

  function setupEvents() {
    if (changeHandler) {
      input.removeEventListener('change', changeHandler);
    }
    changeHandler = (e: Event) => {
      const checked = (e.target as HTMLInputElement).checked;
      currentProps.checked = checked;
      currentProps.onChange?.(checked);
    };
    input.addEventListener('change', changeHandler);
  }

  render();
  setupEvents();

  return {
    get element() {
      return labelWrapper;
    },
    update(nextProps: Partial<CheckboxProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      if (changeHandler) {
        input.removeEventListener('change', changeHandler);
        changeHandler = null;
      }
    }
  };
}
