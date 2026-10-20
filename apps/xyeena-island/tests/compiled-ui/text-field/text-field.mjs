import { Icon } from "../icon/icon.mjs";
let textFieldIdCounter = 0;
function TextField(initialProps) {
  let currentProps = { ...initialProps };
  const instanceId = currentProps.id || `xyn-textfield-${++textFieldIdCounter}`;
  const container = document.createElement("div");
  container.className = `text-field-wrap ${currentProps.className || ""}`.trim();
  const labelEl = document.createElement("label");
  labelEl.htmlFor = instanceId;
  labelEl.className = "text-field-label";
  const box = document.createElement("div");
  box.className = "text-field-box";
  let iconWrap = null;
  let iconInstance = null;
  const input = document.createElement("input");
  input.type = currentProps.type || "text";
  input.id = instanceId;
  input.className = "text-field-input";
  const errorEl = document.createElement("p");
  errorEl.id = `${instanceId}-error`;
  errorEl.className = "text-field-error";
  box.appendChild(input);
  let inputHandler = null;
  let keyHandler = null;
  function render() {
    if (currentProps.label) {
      labelEl.textContent = currentProps.label;
      if (!container.contains(labelEl)) {
        container.insertBefore(labelEl, box);
      }
    } else {
      if (container.contains(labelEl)) {
        container.removeChild(labelEl);
      }
      if (currentProps.ariaLabel) {
        input.setAttribute("aria-label", currentProps.ariaLabel);
      }
    }
    input.value = currentProps.value || "";
    input.placeholder = currentProps.placeholder || "";
    input.disabled = !!currentProps.disabled;
    input.type = currentProps.type || "text";
    if (currentProps.icon) {
      if (!iconWrap) {
        iconWrap = document.createElement("span");
        iconWrap.className = "text-field-icon";
        box.insertBefore(iconWrap, input);
      }
      if (!iconInstance) {
        iconInstance = Icon({ name: currentProps.icon, size: 14 });
        iconWrap.appendChild(iconInstance.element);
      } else {
        iconInstance.update({ name: currentProps.icon });
      }
    } else if (iconWrap) {
      iconInstance?.destroy();
      iconInstance = null;
      if (box.contains(iconWrap)) {
        box.removeChild(iconWrap);
      }
      iconWrap = null;
    }
    if (currentProps.error) {
      box.classList.add("error");
      errorEl.textContent = currentProps.error;
      if (!container.contains(errorEl)) {
        container.appendChild(errorEl);
      }
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", errorEl.id);
    } else {
      box.classList.remove("error");
      if (container.contains(errorEl)) {
        container.removeChild(errorEl);
      }
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }
  function setupEvents() {
    if (inputHandler) input.removeEventListener("input", inputHandler);
    if (keyHandler) input.removeEventListener("keydown", keyHandler);
    inputHandler = (e) => {
      const val = e.target.value;
      currentProps.value = val;
      currentProps.onChange?.(val);
    };
    keyHandler = (e) => {
      if (e.key === "Enter") {
        currentProps.onEnter?.(input.value);
      }
    };
    input.addEventListener("input", inputHandler);
    input.addEventListener("keydown", keyHandler);
  }
  if (!container.contains(box)) {
    container.appendChild(box);
  }
  render();
  setupEvents();
  return {
    get element() {
      return container;
    },
    update(nextProps) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      if (inputHandler) {
        input.removeEventListener("input", inputHandler);
        inputHandler = null;
      }
      if (keyHandler) {
        input.removeEventListener("keydown", keyHandler);
        keyHandler = null;
      }
      iconInstance?.destroy();
      iconInstance = null;
    }
  };
}
export {
  TextField
};
