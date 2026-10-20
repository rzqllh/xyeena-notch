/**
 * @file apps/xyeena-island/src/ui/scroll-area/scroll-area.ts
 * Accessible ScrollArea primitive.
 * Strict Contract: The ONLY permitted vertical scroll owner primitive in Xyeena Island.
 * Focusable when scrollable (WCAG 2.1.1 keyboard scrollability), thin scrollbar, min-height:0.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';

export interface ScrollAreaProps {
  content?: HTMLElement | HTMLElement[];
  className?: string;
  id?: string;
  maxHeight?: string;
}

export type ScrollAreaInstance = ComponentInstance<ScrollAreaProps, HTMLDivElement>;

let scrollAreaIdCounter = 0;

export function ScrollArea(initialProps: ScrollAreaProps = {}): ScrollAreaInstance {
  let currentProps: ScrollAreaProps = { ...initialProps };
  const container = document.createElement('div');
  container.id = currentProps.id || `xyn-scroll-${++scrollAreaIdCounter}`;
  container.className = `scroll-area ${currentProps.className || ''}`.trim();

  let resizeObserver: ResizeObserver | null = null;

  function updateScrollability() {
    // When scrollable, make it keyboard focusable per a11y standards
    const isScrollable = container.scrollHeight > container.clientHeight;
    if (isScrollable) {
      container.tabIndex = 0;
      container.setAttribute('role', 'region');
      container.setAttribute('aria-label', 'Scrollable content');
    } else {
      container.removeAttribute('tabIndex');
      container.removeAttribute('role');
      container.removeAttribute('aria-label');
    }
  }

  function render() {
    container.className = `scroll-area ${currentProps.className || ''}`.trim();
    if (currentProps.maxHeight) {
      container.style.maxHeight = currentProps.maxHeight;
    } else {
      container.style.maxHeight = '';
    }

    if (currentProps.content) {
      container.textContent = '';
      if (Array.isArray(currentProps.content)) {
        for (const child of currentProps.content) {
          container.appendChild(child);
        }
      } else {
        container.appendChild(currentProps.content);
      }
    }

    // Schedule scrollability check
    if (typeof ResizeObserver !== 'undefined' && !resizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        updateScrollability();
      });
      resizeObserver.observe(container);
    } else {
      updateScrollability();
    }
  }

  render();

  return {
    get element() {
      return container;
    },
    update(nextProps: Partial<ScrollAreaProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      container.textContent = '';
    }
  };
}
