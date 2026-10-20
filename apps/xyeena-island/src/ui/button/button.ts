/**
 * @file apps/xyeena-island/src/ui/button/button.ts
 * Accessible Button primitive supporting primary/secondary/ghost/danger variants,
 * loading state, and disabled reason via aria-describedby.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';
import { Icon, type IconInstance } from '../icon/icon.js';
import type { IconName } from '../icon/registry.generated.js';

export interface ButtonProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  disabledReason?: string;
  loading?: boolean;
  icon?: IconName | string;
  iconTrailing?: IconName | string;
  onClick?: (event: MouseEvent) => void;
  className?: string;
  id?: string;
}

export type ButtonInstance = ComponentInstance<ButtonProps, HTMLButtonElement>;

let btnIdCounter = 0;

export function Button(initialProps: ButtonProps): ButtonInstance {
  let currentProps: ButtonProps = { ...initialProps };
  const button = document.createElement('button');
  button.type = currentProps.type || 'button';

  const instanceId = currentProps.id || `xyn-btn-${++btnIdCounter}`;
  button.id = instanceId;

  const descSpan = document.createElement('span');
  descSpan.id = `${instanceId}-reason`;
  descSpan.className = 'sr-only';
  descSpan.style.display = 'none';

  let leadingIconInstance: IconInstance | null = null;
  let trailingIconInstance: IconInstance | null = null;
  let clickHandler: ((e: MouseEvent) => void) | null = null;

  function render() {
    button.className = `btn btn-${currentProps.variant || 'secondary'} btn-${currentProps.size || 'md'} ${currentProps.className || ''}`.trim();

    if (currentProps.disabled || currentProps.loading) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
    } else {
      button.disabled = false;
      button.removeAttribute('aria-disabled');
    }

    if (currentProps.loading) {
      button.setAttribute('aria-busy', 'true');
    } else {
      button.removeAttribute('aria-busy');
    }

    if (currentProps.disabled && currentProps.disabledReason) {
      descSpan.textContent = currentProps.disabledReason;
      button.setAttribute('aria-describedby', descSpan.id);
      if (!button.contains(descSpan)) {
        button.appendChild(descSpan);
      }
    } else {
      button.removeAttribute('aria-describedby');
      if (button.contains(descSpan)) {
        button.removeChild(descSpan);
      }
    }

    // Reconstruct children safely
    // Save descSpan reference if attached
    const hasDesc = button.contains(descSpan);
    button.textContent = '';

    if (currentProps.loading) {
      const spinner = document.createElement('span');
      spinner.className = 'btn-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      button.appendChild(spinner);
    } else if (currentProps.icon) {
      if (!leadingIconInstance) {
        leadingIconInstance = Icon({ name: currentProps.icon, size: currentProps.size === 'sm' ? 14 : 16 });
      } else {
        leadingIconInstance.update({ name: currentProps.icon, size: currentProps.size === 'sm' ? 14 : 16 });
      }
      button.appendChild(leadingIconInstance.element);
    }

    const labelSpan = document.createElement('span');
    labelSpan.className = 'btn-label';
    labelSpan.textContent = currentProps.label;
    button.appendChild(labelSpan);

    if (!currentProps.loading && currentProps.iconTrailing) {
      if (!trailingIconInstance) {
        trailingIconInstance = Icon({ name: currentProps.iconTrailing, size: currentProps.size === 'sm' ? 14 : 16 });
      } else {
        trailingIconInstance.update({ name: currentProps.iconTrailing, size: currentProps.size === 'sm' ? 14 : 16 });
      }
      button.appendChild(trailingIconInstance.element);
    }

    if (hasDesc && !button.contains(descSpan)) {
      button.appendChild(descSpan);
    }
  }

  function setupEvents() {
    if (clickHandler) {
      button.removeEventListener('click', clickHandler);
    }
    if (currentProps.onClick) {
      clickHandler = (e: MouseEvent) => {
        if (!currentProps.disabled && !currentProps.loading) {
          currentProps.onClick?.(e);
        }
      };
      button.addEventListener('click', clickHandler);
    }
  }

  render();
  setupEvents();

  return {
    get element() {
      return button;
    },
    update(nextProps: Partial<ButtonProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
      setupEvents();
    },
    destroy() {
      if (clickHandler) {
        button.removeEventListener('click', clickHandler);
        clickHandler = null;
      }
      leadingIconInstance?.destroy();
      trailingIconInstance?.destroy();
      leadingIconInstance = null;
      trailingIconInstance = null;
    }
  };
}
