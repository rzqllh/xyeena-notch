/**
 * @file apps/xyeena-island/src/ui/select/select.ts
 * Accessible Select primitive using semantic HTML select and chevron icon indicator.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';
import { Icon, type IconInstance } from '../icon/icon.js';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  label: string;
  options: SelectOption[];
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  description?: string;
}

export type SelectInstance = ComponentInstance<SelectProps, HTMLDivElement>;

let selectIdCounter = 0;

export function Select(initialProps: SelectProps): SelectInstance {
  let currentProps: SelectProps = { ...initialProps };
  const instanceId = currentProps.id || `xyn-select-${++selectIdCounter}`;

  const container = document.createElement('div');
  container.className = `select-wrap ${currentProps.className || ''}`.trim();

  const labelEl = document.createElement('label');
  labelEl.htmlFor = instanceId;
  labelEl.className = 'select-label';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'select-input-wrap';

  const select = document.createElement('select');
  select.id = instanceId;
  select.className = 'select-input';

  const arrowWrap = document.createElement('span');
  arrowWrap.className = 'select-arrow';
  arrowWrap.setAttribute('aria-hidden', 'true');

  const arrowIcon: IconInstance = Icon({ name: 'caret-down', size: 14 });
  arrowWrap.appendChild(arrowIcon.element);

  inputWrap.appendChild(select);
  inputWrap.appendChild(arrowWrap);

  container.appendChild(labelEl);
  container.appendChild(inputWrap);

  let changeHandler: ((e: Event) => void) | null = null;

  function render() {
    labelEl.textContent = currentProps.label;
    select.disabled = !!currentProps.disabled;

    select.textContent = '';
    for (const opt of currentProps.options) {
      const optEl = document.createElement('option');
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      if (opt.disabled) optEl.disabled = true;
      if (opt.value === currentProps.value) optEl.selected = true;
      select.appendChild(optEl);
    }
  }

  function setupEvents() {
    if (changeHandler) {
      select.removeEventListener('change', changeHandler);
    }
    changeHandler = (e: Event) => {
      const val = (e.target as HTMLSelectElement).value;
      currentProps.value = val;
      currentProps.onChange?.(val);
    };
    select.addEventListener('change', changeHandler);
  }

  render();
  setupEvents();

  return {
    get element() {
      return container;
    },
    update(nextProps: Partial<SelectProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      if (changeHandler) {
        select.removeEventListener('change', changeHandler);
        changeHandler = null;
      }
      arrowIcon.destroy();
    }
  };
}
