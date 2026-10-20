import { Icon } from "../icon/icon.mjs";
let iconBtnIdCounter = 0;
function IconButton(initialProps) {
  if (!initialProps.label || !initialProps.label.trim()) {
    throw new Error("IconButton requires a non-empty accessible `label`");
  }
  let currentProps = { ...initialProps };
  const button = document.createElement("button");
  button.type = "button";
  const instanceId = currentProps.id || `xyn-icon-btn-${++iconBtnIdCounter}`;
  button.id = instanceId;
  const descSpan = document.createElement("span");
  descSpan.id = `${instanceId}-reason`;
  descSpan.className = "sr-only";
  descSpan.style.display = "none";
  let iconInstance = null;
  let clickHandler = null;
  function render() {
    const accessibleLabel = (currentProps.label || "").trim();
    if (!accessibleLabel) {
      throw new Error("IconButton requires a non-empty accessible `label`");
    }
    button.className = `icon-btn icon-btn-${currentProps.variant || "ghost"} icon-btn-${currentProps.size || "md"} ${currentProps.className || ""}`.trim();
    button.setAttribute("aria-label", accessibleLabel);
    button.title = currentProps.title || accessibleLabel;
    if (currentProps.disabled) {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    } else {
      button.disabled = false;
      button.removeAttribute("aria-disabled");
    }
    if (currentProps.disabled && currentProps.disabledReason) {
      descSpan.textContent = currentProps.disabledReason;
      button.setAttribute("aria-describedby", descSpan.id);
      if (!button.contains(descSpan)) {
        button.appendChild(descSpan);
      }
    } else {
      button.removeAttribute("aria-describedby");
      if (button.contains(descSpan)) {
        button.removeChild(descSpan);
      }
    }
    const iconSize = currentProps.size === "sm" ? 14 : currentProps.size === "lg" ? 20 : 16;
    if (!iconInstance) {
      iconInstance = Icon({ name: currentProps.icon, size: iconSize });
      button.appendChild(iconInstance.element);
    } else {
      iconInstance.update({ name: currentProps.icon, size: iconSize });
      if (!button.contains(iconInstance.element)) {
        button.appendChild(iconInstance.element);
      }
    }
  }
  function setupEvents() {
    if (clickHandler) {
      button.removeEventListener("click", clickHandler);
    }
    if (currentProps.onClick) {
      clickHandler = (e) => {
        if (!currentProps.disabled) {
          currentProps.onClick?.(e);
        }
      };
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
  IconButton
};
