/**
 * @file apps/xyeena-island/src/ui/section-header/section-header.ts
 * Accessible SectionHeader primitive.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';

export interface SectionHeaderProps {
  title: string;
  kicker?: string;
  action?: HTMLElement;
  className?: string;
}

export type SectionHeaderInstance = ComponentInstance<SectionHeaderProps, HTMLDivElement>;

export function SectionHeader(initialProps: SectionHeaderProps): SectionHeaderInstance {
  let currentProps: SectionHeaderProps = { ...initialProps };
  const container = document.createElement('div');

  const textWrap = document.createElement('div');
  textWrap.className = 'section-hdr-text';

  const kickerEl = document.createElement('span');
  kickerEl.className = 'section-hdr-kicker';

  const titleEl = document.createElement('h2');
  titleEl.className = 'section-hdr-title';

  textWrap.appendChild(titleEl);

  const actionWrap = document.createElement('div');
  actionWrap.className = 'section-hdr-action';

  container.appendChild(textWrap);
  container.appendChild(actionWrap);

  function render() {
    container.className = `section-hdr ${currentProps.className || ''}`.trim();
    titleEl.textContent = currentProps.title;

    if (currentProps.kicker) {
      kickerEl.textContent = currentProps.kicker;
      if (!textWrap.contains(kickerEl)) {
        textWrap.insertBefore(kickerEl, titleEl);
      }
    } else if (textWrap.contains(kickerEl)) {
      textWrap.removeChild(kickerEl);
    }

    actionWrap.textContent = '';
    if (currentProps.action) {
      actionWrap.appendChild(currentProps.action);
      actionWrap.style.display = 'flex';
    } else {
      actionWrap.style.display = 'none';
    }
  }

  render();

  return {
    get element() {
      return container;
    },
    update(nextProps: Partial<SectionHeaderProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      actionWrap.textContent = '';
    }
  };
}
