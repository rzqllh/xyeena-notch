/**
 * @file apps/xyeena-island/src/ui/tabs/tabs.ts
 * Accessible Tabs primitive supporting roving tabindex, arrow navigation, and Home/End keys.
 * Ref: docs/adr/0001-ui-component-model.md
 */

import type { ComponentInstance } from '../types.js';
import { Icon, type IconInstance } from '../icon/icon.js';
import type { IconName } from '../icon/registry.generated.js';

export interface TabItem {
  id: string;
  label: string;
  icon?: IconName | string;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  ariaLabel?: string;
  className?: string;
  id?: string;
}

export type TabsInstance = ComponentInstance<TabsProps, HTMLDivElement>;

let tabsIdCounter = 0;

export function Tabs(initialProps: TabsProps): TabsInstance {
  let currentProps: TabsProps = { ...initialProps };
  const instanceId = currentProps.id || `xyn-tabs-${++tabsIdCounter}`;

  const container = document.createElement('div');
  container.id = instanceId;
  container.className = `tabs-bar ${currentProps.className || ''}`.trim();
  container.setAttribute('role', 'tablist');

  let tabButtons: HTMLButtonElement[] = [];
  let iconInstances: IconInstance[] = [];

  function cleanChildren() {
    iconInstances.forEach(i => i.destroy());
    iconInstances = [];
    tabButtons = [];
    container.textContent = '';
  }

  function render() {
    cleanChildren();
    if (currentProps.ariaLabel) {
      container.setAttribute('aria-label', currentProps.ariaLabel);
    }

    currentProps.tabs.forEach((tab, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = `${instanceId}-tab-${tab.id}`;
      btn.className = 'tab-btn';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-controls', `panel-${tab.id}`);

      const isActive = tab.id === currentProps.activeTab;
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      // Roving tabindex: active has 0, inactive has -1
      btn.tabIndex = isActive ? 0 : -1;

      if (tab.icon) {
        const icon = Icon({ name: tab.icon, size: 14 });
        iconInstances.push(icon);
        btn.appendChild(icon.element);
      }

      const labelSpan = document.createElement('span');
      labelSpan.textContent = tab.label;
      btn.appendChild(labelSpan);

      if (tab.badge !== undefined && tab.badge !== null) {
        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'tab-badge';
        badgeSpan.textContent = String(tab.badge);
        btn.appendChild(badgeSpan);
      }

      btn.addEventListener('click', () => {
        selectTab(tab.id);
      });

      btn.addEventListener('keydown', (e: KeyboardEvent) => {
        handleKeydown(e, index);
      });

      tabButtons.push(btn);
      container.appendChild(btn);
    });
  }

  function selectTab(id: string) {
    if (id === currentProps.activeTab) return;
    currentProps.activeTab = id;
    tabButtons.forEach((btn, idx) => {
      const isSel = currentProps.tabs[idx].id === id;
      btn.setAttribute('aria-selected', isSel ? 'true' : 'false');
      btn.tabIndex = isSel ? 0 : -1;
      if (isSel) btn.focus();
    });
    currentProps.onChange(id);
  }

  function handleKeydown(e: KeyboardEvent, currentIndex: number) {
    let targetIndex = -1;
    const count = tabButtons.length;
    if (count <= 1) return;

    if (e.key === 'ArrowRight') {
      targetIndex = (currentIndex + 1) % count;
    } else if (e.key === 'ArrowLeft') {
      targetIndex = (currentIndex - 1 + count) % count;
    } else if (e.key === 'Home') {
      targetIndex = 0;
    } else if (e.key === 'End') {
      targetIndex = count - 1;
    }

    if (targetIndex >= 0) {
      e.preventDefault();
      selectTab(currentProps.tabs[targetIndex].id);
    }
  }

  render();

  return {
    get element() {
      return container;
    },
    update(nextProps: Partial<TabsProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      cleanChildren();
    }
  };
}
