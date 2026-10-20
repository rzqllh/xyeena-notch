import { Icon } from "../icon/icon.mjs";
function EmptyState(initialProps) {
  let currentProps = { ...initialProps };
  const container = document.createElement("div");
  container.className = `empty-state ${currentProps.className || ""}`.trim();
  let iconInstance = null;
  const iconWrap = document.createElement("div");
  iconWrap.className = "empty-state-icon";
  const content = document.createElement("div");
  content.className = "empty-state-content";
  const titleEl = document.createElement("h3");
  titleEl.className = "empty-state-title";
  const descEl = document.createElement("p");
  descEl.className = "empty-state-desc";
  content.appendChild(titleEl);
  const actionWrap = document.createElement("div");
  actionWrap.className = "empty-state-action";
  function render() {
    container.className = `empty-state ${currentProps.className || ""}`.trim();
    titleEl.textContent = currentProps.title;
    if (currentProps.description) {
      descEl.textContent = currentProps.description;
      if (!content.contains(descEl)) {
        content.appendChild(descEl);
      }
    } else if (content.contains(descEl)) {
      content.removeChild(descEl);
    }
    container.textContent = "";
    if (currentProps.icon) {
      if (!iconInstance) {
        iconInstance = Icon({ name: currentProps.icon, size: 22 });
      } else {
        iconInstance.update({ name: currentProps.icon });
      }
      iconWrap.textContent = "";
      iconWrap.appendChild(iconInstance.element);
      container.appendChild(iconWrap);
    } else if (iconInstance) {
      iconInstance.destroy();
      iconInstance = null;
    }
    container.appendChild(content);
    if (currentProps.action) {
      actionWrap.textContent = "";
      actionWrap.appendChild(currentProps.action);
      container.appendChild(actionWrap);
    }
  }
  render();
  return {
    get element() {
      return container;
    },
    update(nextProps) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      iconInstance?.destroy();
      iconInstance = null;
      container.textContent = "";
    }
  };
}
export {
  EmptyState
};
