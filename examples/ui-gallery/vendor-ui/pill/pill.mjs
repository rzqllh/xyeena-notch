import { Icon } from "../icon/icon.mjs";
let pillIdCounter = 0;
function Pill(initialProps) {
  let currentProps = { ...initialProps };
  const button = document.createElement("button");
  button.type = "button";
  button.id = currentProps.id || `xyn-pill-${++pillIdCounter}`;
  let iconInstance = null;
  const labelSpan = document.createElement("span");
  labelSpan.className = "pill-label";
  const countSpan = document.createElement("span");
  countSpan.className = "pill-count";
  let clickHandler = null;
  function render() {
    button.className = `pill ${currentProps.active ? "active" : ""} ${currentProps.className || ""}`.trim();
    button.setAttribute("aria-pressed", currentProps.active ? "true" : "false");
    labelSpan.textContent = currentProps.label;
    button.textContent = "";
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
    if (currentProps.count !== void 0 && currentProps.count !== null) {
      countSpan.textContent = String(currentProps.count);
      button.appendChild(countSpan);
    }
  }
  function setupEvents() {
    if (clickHandler) {
      button.removeEventListener("click", clickHandler);
    }
    if (currentProps.onClick) {
      clickHandler = () => currentProps.onClick?.();
      button.addEventListener("click", clickHandler);
    }
  }
  render();
  setupEvents();
  return {
    get element() {
      return button;
    },
    update(nextProps) {
      currentProps = { ...currentProps, ...nextProps };
      render();
      setupEvents();
    },
    destroy() {
      if (clickHandler) {
        button.removeEventListener("click", clickHandler);
        clickHandler = null;
      }
      iconInstance?.destroy();
      iconInstance = null;
    }
  };
}
export {
  Pill
};
