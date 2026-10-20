/**
 * @file apps/xyeena-island/src/ui/popover/popover.ts
 * Accessible Popover primitive with click-outside dismiss and Esc support.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';

export interface PopoverProps {
  trigger: HTMLElement;
  content: HTMLElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  id?: string;
}

export type PopoverInstance = ComponentInstance<PopoverProps, HTMLDivElement>;

let popoverIdCounter = 0;

export function Popover(initialProps: PopoverProps): PopoverInstance {
  let currentProps: PopoverProps = { ...initialProps };
  const instanceId = currentProps.id || `xyn-popover-${++popoverIdCounter}`;

  const container = document.createElement('div');
  container.className = `popover-wrap ${currentProps.className || ''}`.trim();

  const panel = document.createElement('div');
  panel.id = `${instanceId}-panel`;
  panel.className = 'popover-panel';
  panel.setAttribute('role', 'region');

  let clickOutsideHandler: ((e: MouseEvent) => void) | null = null;
  let keyHandler: ((e: KeyboardEvent) => void) | null = null;
  let triggerClickHandler: ((e: MouseEvent) => void) | null = null;

  function toggle() {
    const next = !currentProps.open;
    currentProps.open = next;
    render();
    currentProps.onOpenChange?.(next);
  }

  function close() {
    if (!currentProps.open) return;
    currentProps.open = false;
    render();
    currentProps.onOpenChange?.(false);
  }

  function setupGlobalListeners() {
    if (clickOutsideHandler) document.removeEventListener('click', clickOutsideHandler);
    if (keyHandler) document.removeEventListener('keydown', keyHandler);

    clickOutsideHandler = (e: MouseEvent) => {
      if (!container.contains(e.target as Node)) {
        close();
      }
    };

    keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };

    document.addEventListener('click', clickOutsideHandler);
    document.addEventListener('keydown', keyHandler);
  }

  function removeGlobalListeners() {
    if (clickOutsideHandler) {
      document.removeEventListener('click', clickOutsideHandler);
      clickOutsideHandler = null;
    }
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
  }

  function render() {
    const isOpen = !!currentProps.open;

    currentProps.trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    currentProps.trigger.setAttribute('aria-haspopup', 'true');
    currentProps.trigger.setAttribute('aria-controls', panel.id);

    panel.hidden = !isOpen;

    if (isOpen) {
      setupGlobalListeners();
    } else {
      removeGlobalListeners();
    }
  }

  container.appendChild(currentProps.trigger);
  panel.appendChild(currentProps.content);
  container.appendChild(panel);

  triggerClickHandler = (e: MouseEvent) => {
    e.stopPropagation();
    toggle();
  };
  currentProps.trigger.addEventListener('click', triggerClickHandler);

  render();

  return {
    get element() {
      return container;
    },
    update(nextProps: Partial<PopoverProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      removeGlobalListeners();
      if (triggerClickHandler) {
        currentProps.trigger.removeEventListener('click', triggerClickHandler);
        triggerClickHandler = null;
      }
    }
  };
}
