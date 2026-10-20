/**
 * @file apps/xyeena-island/src/ui/status-dot/status-dot.ts
 * Accessible StatusDot primitive.
 * Strict Contract: Never color-only; always provides accessible text representation.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';

export type StatusType = 'ok' | 'warn' | 'danger' | 'idle' | 'busy';

export interface StatusDotProps {
  status: StatusType;
  /** Mandatory accessible label or status description (e.g. "Connected", "Approval Required") */
  label: string;
  showText?: boolean;
  className?: string;
}

export type StatusDotInstance = ComponentInstance<StatusDotProps, HTMLSpanElement>;

export function StatusDot(initialProps: StatusDotProps): StatusDotInstance {
  if (!initialProps.label || !initialProps.label.trim()) {
    throw new Error('StatusDot requires a non-empty `label` to satisfy non-color-only a11y contract.');
  }

  let currentProps: StatusDotProps = { ...initialProps };
  const span = document.createElement('span');

  const dot = document.createElement('span');
  dot.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');

  span.appendChild(dot);
  span.appendChild(text);

  function render() {
    const accessibleLabel = (currentProps.label || '').trim();
    if (!accessibleLabel) {
      throw new Error('StatusDot requires a non-empty `label` to satisfy non-color-only a11y contract.');
    }

    span.className = `status-dot-wrap ${currentProps.className || ''}`.trim();
    dot.className = `status-dot status-dot-${currentProps.status}`;

    text.textContent = accessibleLabel;
    if (currentProps.showText) {
      text.className = 'status-dot-text';
      span.removeAttribute('aria-label');
      span.removeAttribute('role');
    } else {
      text.className = 'sr-only';
      span.setAttribute('role', 'status');
      span.setAttribute('aria-label', accessibleLabel);
    }
  }

  render();

  return {
    get element() {
      return span;
    },
    update(nextProps: Partial<StatusDotProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      // No event listeners to clean
    }
  };
}
