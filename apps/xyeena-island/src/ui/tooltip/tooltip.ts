/**
 * @file apps/xyeena-island/src/ui/tooltip/tooltip.ts
 * Accessible Tooltip primitive with focus/hover triggers and ARIA describedby binding.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';

export interface TooltipProps {
  text: string;
  target: HTMLElement;
  id?: string;
  className?: string;
}

export type TooltipInstance = ComponentInstance<TooltipProps, HTMLDivElement>;

let tooltipIdCounter = 0;

export function Tooltip(initialProps: TooltipProps): TooltipInstance {
  let currentProps: TooltipProps = { ...initialProps };
  const instanceId = currentProps.id || `xyn-tooltip-${++tooltipIdCounter}`;

  const bubble = document.createElement('div');
  bubble.id = instanceId;
  bubble.className = `tooltip-bubble ${currentProps.className || ''}`.trim();
  bubble.setAttribute('role', 'tooltip');
  bubble.hidden = true;

  let showTimer: any = null;

  function show() {
    clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      bubble.hidden = false;
      position();
    }, 150);
  }

  function hide() {
    clearTimeout(showTimer);
    bubble.hidden = true;
  }

  function position() {
    if (bubble.hidden || !currentProps.target) return;
    const rect = currentProps.target.getBoundingClientRect();
    bubble.style.top = `${rect.bottom + 4}px`;
    bubble.style.left = `${rect.left + rect.width / 2}px`;
    bubble.style.transform = 'translateX(-50%)';
  }

  function render() {
    bubble.textContent = currentProps.text;
    currentProps.target.setAttribute('aria-describedby', bubble.id);
  }

  const onMouseEnter = () => show();
  const onMouseLeave = () => hide();
  const onFocus = () => show();
  const onBlur = () => hide();

  currentProps.target.addEventListener('mouseenter', onMouseEnter);
  currentProps.target.addEventListener('mouseleave', onMouseLeave);
  currentProps.target.addEventListener('focus', onFocus);
  currentProps.target.addEventListener('blur', onBlur);

  document.body.appendChild(bubble);
  render();

  return {
    get element() {
      return bubble;
    },
    update(nextProps: Partial<TooltipProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      clearTimeout(showTimer);
      currentProps.target.removeEventListener('mouseenter', onMouseEnter);
      currentProps.target.removeEventListener('mouseleave', onMouseLeave);
      currentProps.target.removeEventListener('focus', onFocus);
      currentProps.target.removeEventListener('blur', onBlur);
      currentProps.target.removeAttribute('aria-describedby');
      if (bubble.parentNode) {
        bubble.parentNode.removeChild(bubble);
      }
    }
  };
}
