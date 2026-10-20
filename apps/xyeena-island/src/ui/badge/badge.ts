/**
 * @file apps/xyeena-island/src/ui/badge/badge.ts
 * Accessible Badge primitive for tags, statuses, and counts.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';
import { Icon, type IconInstance } from '../icon/icon.js';
import type { IconName } from '../icon/registry.generated.js';

export interface BadgeProps {
  label: string;
  variant?: 'default' | 'ok' | 'warn' | 'danger' | 'info' | 'accent';
  icon?: IconName | string;
  className?: string;
}

export type BadgeInstance = ComponentInstance<BadgeProps, HTMLSpanElement>;

export function Badge(initialProps: BadgeProps): BadgeInstance {
  let currentProps: BadgeProps = { ...initialProps };
  const span = document.createElement('span');

  let iconInstance: IconInstance | null = null;
  const labelSpan = document.createElement('span');
  labelSpan.className = 'badge-label';

  function render() {
    span.className = `badge badge-${currentProps.variant || 'default'} ${currentProps.className || ''}`.trim();
    labelSpan.textContent = currentProps.label;

    span.textContent = '';
    if (currentProps.icon) {
      if (!iconInstance) {
        iconInstance = Icon({ name: currentProps.icon, size: 12 });
      } else {
        iconInstance.update({ name: currentProps.icon, size: 12 });
      }
      span.appendChild(iconInstance.element);
    } else if (iconInstance) {
      iconInstance.destroy();
      iconInstance = null;
    }
    span.appendChild(labelSpan);
  }

  render();

  return {
    get element() {
      return span;
    },
    update(nextProps: Partial<BadgeProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      iconInstance?.destroy();
      iconInstance = null;
    }
  };
}
