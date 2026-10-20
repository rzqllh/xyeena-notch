/**
 * @file apps/xyeena-island/src/ui/empty-state/empty-state.ts
 * Accessible EmptyState primitive for zero-session, zero-data, and initial onboarding states.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';
import { Icon, type IconInstance } from '../icon/icon.js';
import type { IconName } from '../icon/registry.generated.js';

export interface EmptyStateProps {
  icon?: IconName | string;
  title: string;
  description?: string;
  action?: HTMLElement;
  className?: string;
  id?: string;
}

export type EmptyStateInstance = ComponentInstance<EmptyStateProps, HTMLDivElement>;

export function EmptyState(initialProps: EmptyStateProps): EmptyStateInstance {
  let currentProps: EmptyStateProps = { ...initialProps };
  const container = document.createElement('div');
  container.className = `empty-state ${currentProps.className || ''}`.trim();

  let iconInstance: IconInstance | null = null;
  const iconWrap = document.createElement('div');
  iconWrap.className = 'empty-state-icon';

  const content = document.createElement('div');
  content.className = 'empty-state-content';

  const titleEl = document.createElement('h3');
  titleEl.className = 'empty-state-title';

  const descEl = document.createElement('p');
  descEl.className = 'empty-state-desc';

  content.appendChild(titleEl);

  const actionWrap = document.createElement('div');
  actionWrap.className = 'empty-state-action';

  function render() {
    container.className = `empty-state ${currentProps.className || ''}`.trim();
    titleEl.textContent = currentProps.title;

    if (currentProps.description) {
      descEl.textContent = currentProps.description;
      if (!content.contains(descEl)) {
        content.appendChild(descEl);
      }
    } else if (content.contains(descEl)) {
      content.removeChild(descEl);
    }

    container.textContent = '';
    if (currentProps.icon) {
      if (!iconInstance) {
        iconInstance = Icon({ name: currentProps.icon, size: 22 });
      } else {
        iconInstance.update({ name: currentProps.icon });
      }
      iconWrap.textContent = '';
      iconWrap.appendChild(iconInstance.element);
      container.appendChild(iconWrap);
    } else if (iconInstance) {
      iconInstance.destroy();
      iconInstance = null;
    }

    container.appendChild(content);

    if (currentProps.action) {
      actionWrap.textContent = '';
      actionWrap.appendChild(currentProps.action);
      container.appendChild(actionWrap);
    }
  }

  render();

  return {
    get element() {
      return container;
    },
    update(nextProps: Partial<EmptyStateProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      iconInstance?.destroy();
      iconInstance = null;
      container.textContent = '';
    }
  };
}
