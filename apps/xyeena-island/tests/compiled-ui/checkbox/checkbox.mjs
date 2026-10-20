let checkboxIdCounter = 0;
function Checkbox(initialProps) {
  let currentProps = { ...initialProps };
  const instanceId = currentProps.id || `xyn-checkbox-${++checkboxIdCounter}`;
  const labelWrapper = document.createElement("label");
  labelWrapper.className = `checkbox-wrap ${currentProps.className || ""}`.trim();
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = instanceId;
  input.className = "checkbox-input";
  const textWrap = document.createElement("div");
  textWrap.className = "checkbox-text";
  const labelSpan = document.createElement("span");
  labelSpan.className = "checkbox-label";
  const descSpan = document.createElement("span");
  descSpan.id = `${instanceId}-desc`;
  descSpan.className = "checkbox-desc";
  textWrap.appendChild(labelSpan);
  labelWrapper.appendChild(input);
  labelWrapper.appendChild(textWrap);
  let changeHandler = null;
  function render() {
    input.checked = !!currentProps.checked;
    input.disabled = !!currentProps.disabled;
    if (currentProps.disabled) {
      labelWrapper.classList.add("disabled");
      input.setAttribute("aria-disabled", "true");
    } else {
      labelWrapper.classList.remove("disabled");
      input.removeAttribute("aria-disabled");
    }
    labelSpan.textContent = currentProps.label;
    if (currentProps.description) {
      descSpan.textContent = currentProps.description;
      if (!textWrap.contains(descSpan)) {
        textWrap.appendChild(descSpan);
      }
      input.setAttribute("aria-describedby", descSpan.id);
    } else {
      if (textWrap.contains(descSpan)) {
        textWrap.removeChild(descSpan);
      }
      input.removeAttribute("aria-describedby");
    }
  }
  function setupEvents() {
    if (changeHandler) {
      input.removeEventListener("change", changeHandler);
    }
    changeHandler = (e) => {
      const checked = e.target.checked;
      currentProps.checked = checked;
      currentProps.onChange?.(checked);
    };
    input.addEventListener("change", changeHandler);
  }
  render();
  setupEvents();
  return {
    get element() {
      return labelWrapper;
    },
    update(nextProps) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      if (changeHandler) {
        input.removeEventListener("change", changeHandler);
        changeHandler = null;
      }
    }
  };
}
export {
  Checkbox
};
