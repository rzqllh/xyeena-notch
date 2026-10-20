import { Icon } from "../icon/icon.mjs";
let btnIdCounter = 0;
function Button(initialProps) {
  let currentProps = { ...initialProps };
  const button = document.createElement("button");
  button.type = currentProps.type || "button";
  const instanceId = currentProps.id || `xyn-btn-${++btnIdCounter}`;
  button.id = instanceId;
  const descSpan = document.createElement("span");
  descSpan.id = `${instanceId}-reason`;
  descSpan.className = "sr-only";
  descSpan.style.display = "none";
  let leadingIconInstance = null;
  let trailingIconInstance = null;
  let clickHandler = null;
  function render() {
    button.className = `btn btn-${currentProps.variant || "secondary"} btn-${currentProps.size || "md"} ${currentProps.className || ""}`.trim();
    if (currentProps.disabled || currentProps.loading) {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    } else {
      button.disabled = false;
      button.removeAttribute("aria-disabled");
    }
    if (currentProps.loading) {
      button.setAttribute("aria-busy", "true");
    } else {
      button.removeAttribute("aria-busy");
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
    const hasDesc = button.contains(descSpan);
    button.textContent = "";
    if (currentProps.loading) {
      const spinner = document.createElement("span");
      spinner.className = "btn-spinner";
      spinner.setAttribute("aria-hidden", "true");
      button.appendChild(spinner);
    } else if (currentProps.icon) {
      if (!leadingIconInstance) {
        leadingIconInstance = Icon({ name: currentProps.icon, size: currentProps.size === "sm" ? 14 : 16 });
      } else {
        leadingIconInstance.update({ name: currentProps.icon, size: currentProps.size === "sm" ? 14 : 16 });
      }
      button.appendChild(leadingIconInstance.element);
    }
    const labelSpan = document.createElement("span");
    labelSpan.className = "btn-label";
    labelSpan.textContent = currentProps.label;
    button.appendChild(labelSpan);
    if (!currentProps.loading && currentProps.iconTrailing) {
      if (!trailingIconInstance) {
        trailingIconInstance = Icon({ name: currentProps.iconTrailing, size: currentProps.size === "sm" ? 14 : 16 });
      } else {
        trailingIconInstance.update({ name: currentProps.iconTrailing, size: currentProps.size === "sm" ? 14 : 16 });
      }
      button.appendChild(trailingIconInstance.element);
    }
    if (hasDesc && !button.contains(descSpan)) {
      button.appendChild(descSpan);
    }
  }
  function setupEvents() {
    if (clickHandler) {
      button.removeEventListener("click", clickHandler);
    }
    if (currentProps.onClick) {
      clickHandler = (e) => {
        if (!currentProps.disabled && !currentProps.loading) {
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
      leadingIconInstance?.destroy();
      trailingIconInstance?.destroy();
      leadingIconInstance = null;
      trailingIconInstance = null;
    }
  };
}
export {
  Button
};
