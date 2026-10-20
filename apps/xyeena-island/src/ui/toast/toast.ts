/**
 * @file apps/xyeena-island/src/ui/toast/toast.ts
 * Accessible Toast notification primitive with lifecycle, auto-dismiss timers, and ARIA live regions.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';
import { Icon, type IconInstance } from '../icon/icon.js';
import { IconButton } from '../icon-button/icon-button.js';
import type { IconName } from '../icon/registry.generated.js';

export interface ToastProps {
  message: string;
  variant?: 'info' | 'ok' | 'warn' | 'danger';
  duration?: number;
  onDismiss?: () => void;
  className?: string;
  id?: string;
}

export type ToastInstance = ComponentInstance<ToastProps, HTMLDivElement>;

let toastIdCounter = 0;

export function Toast(initialProps: ToastProps): ToastInstance {
  let currentProps: ToastProps = { ...initialProps };
  const container = document.createElement('div');
  container.id = currentProps.id || `xyn-toast-${++toastIdCounter}`;

  let timer: any = null;
  let iconInstance: IconInstance | null = null;
  const msgEl = document.createElement('p');
  msgEl.className = 'toast-msg';

  const closeBtn = IconButton({
    icon: 'x',
    label: 'Dismiss notification',
    size: 'sm',
    onClick: () => {
      dismiss();
    }
  });

  function getVariantIcon(v: string): IconName {
    if (v === 'ok') return 'check-circle';
    if (v === 'warn') return 'warning';
    if (v === 'danger') return 'x-circle';
    return 'info';
  }

  function dismiss() {
    clearTimeout(timer);
    timer = null;
    currentProps.onDismiss?.();
  }

  function render() {
    const variant = currentProps.variant || 'info';
    container.className = `toast-item toast-${variant} ${currentProps.className || ''}`.trim();
    container.setAttribute('role', variant === 'danger' ? 'alert' : 'status');
    container.setAttribute('aria-live', variant === 'danger' ? 'assertive' : 'polite');

    const iconName = getVariantIcon(variant);
    if (!iconInstance) {
      iconInstance = Icon({ name: iconName, size: 16 });
    } else {
      iconInstance.update({ name: iconName });
    }

    msgEl.textContent = currentProps.message;

    container.textContent = '';
    container.appendChild(iconInstance.element);
    container.appendChild(msgEl);
    container.appendChild(closeBtn.element);

    clearTimeout(timer);
    const dur = currentProps.duration !== undefined ? currentProps.duration : 4000;
    if (dur > 0) {
      timer = setTimeout(() => {
        dismiss();
      }, dur);
    }
  }

  render();

  return {
    get element() {
      return container;
    },
    update(nextProps: Partial<ToastProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      clearTimeout(timer);
      timer = null;
      iconInstance?.destroy();
      iconInstance = null;
      closeBtn.destroy();
    }
  };
}
