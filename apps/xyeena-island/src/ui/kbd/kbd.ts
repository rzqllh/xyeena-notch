/**
 * @file apps/xyeena-island/src/ui/kbd/kbd.ts
 * Accessible Kbd primitive for keyboard shortcuts.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';

export interface KbdProps {
  shortcut: string;
  className?: string;
}

export type KbdInstance = ComponentInstance<KbdProps, HTMLSpanElement>;

export function Kbd(initialProps: KbdProps): KbdInstance {
  let currentProps: KbdProps = { ...initialProps };
  const span = document.createElement('span');

  function render() {
    span.className = `kbd-shortcut ${currentProps.className || ''}`.trim();
    span.textContent = '';

    const parts = (currentProps.shortcut || '').split('+');
    parts.forEach((part, idx) => {
      const kbd = document.createElement('kbd');
      kbd.className = 'kbd-key';
      kbd.textContent = part.trim();
      span.appendChild(kbd);

      if (idx < parts.length - 1) {
        const plus = document.createElement('span');
        plus.className = 'kbd-sep';
        plus.textContent = '+';
        plus.setAttribute('aria-hidden', 'true');
        span.appendChild(plus);
      }
    });
  }

  render();

  return {
    get element() {
      return span;
    },
    update(nextProps: Partial<KbdProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      span.textContent = '';
    }
  };
}
