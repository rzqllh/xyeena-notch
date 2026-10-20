/**
 * @file apps/xyeena-island/src/ui/pill/pill.ts
 * Accessible Pill primitive for session selection, filter tags, and quick actions.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';
import { Icon, type IconInstance } from '../icon/icon.js';
import type { IconName } from '../icon/registry.generated.js';

export interface PillProps {
  label: string;
  active?: boolean;
  icon?: IconName | string;
  count?: number;
  onClick?: () => void;
  className?: string;
  id?: string;
}

export type PillInstance = ComponentInstance<PillProps, HTMLButtonElement>;

let pillIdCounter = 0;

export function Pill(initialProps: PillProps): PillInstance {
  let currentProps: PillProps = { ...initialProps };
  const button = document.createElement('button');
  button.type = 'button';
  button.id = currentProps.id || `xyn-pill-${++pillIdCounter}`;

  let iconInstance: IconInstance | null = null;
  const labelSpan = document.createElement('span');
  labelSpan.className = 'pill-label';

  const countSpan = document.createElement('span');
  countSpan.className = 'pill-count';

  let clickHandler: ((e: MouseEvent) => void) | null = null;

  function render() {
    button.className = `pill ${currentProps.active ? 'active' : ''} ${currentProps.className || ''}`.trim();
    button.setAttribute('aria-pressed', currentProps.active ? 'true' : 'false');
    labelSpan.textContent = currentProps.label;

    button.textContent = '';
    if (currentProps.icon) {
      if (!iconInstance) {
        iconInstance = Icon({ name: currentProps.icon, size: 12 });
      } else {
        iconInstance.update({ name: currentProps.icon, size: 12 });
      }
      button.appendChild(iconInstance.element);
    } else if (iconInstance) {
      iconInstance.destroy();
      iconInstance = null;
    }

    button.appendChild(labelSpan);

    if (currentProps.count !== undefined && currentProps.count !== null) {
      countSpan.textContent = String(currentProps.count);
      button.appendChild(countSpan);
    }
  }

  function setupEvents() {
    if (clickHandler) {
      button.removeEventListener('click', clickHandler);
    }
    if (currentProps.onClick) {
      clickHandler = () => currentProps.onClick?.();
      button.addEventListener('click', clickHandler);
    }
  }

  render();
  setupEvents();

  return {
    get element() {
      return button;
    },
    update(nextProps: Partial<PillProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
      setupEvents();
    },
    destroy() {
      if (clickHandler) {
        button.removeEventListener('click', clickHandler);
        clickHandler = null;
      }
      iconInstance?.destroy();
      iconInstance = null;
    }
  };
}
