let toggleIdCounter = 0;
function Toggle(initialProps) {
  let currentProps = { ...initialProps };
  const instanceId = currentProps.id || `xyn-toggle-${++toggleIdCounter}`;
  const container = document.createElement("div");
  container.className = `toggle-wrap ${currentProps.className || ""}`.trim();
  const textWrap = document.createElement("div");
  textWrap.className = "toggle-text";
  const labelEl = document.createElement("label");
  labelEl.id = `${instanceId}-label`;
  labelEl.htmlFor = `${instanceId}-btn`;
  labelEl.className = "toggle-label";
  const descEl = document.createElement("p");
  descEl.id = `${instanceId}-desc`;
  descEl.className = "toggle-desc";
  textWrap.appendChild(labelEl);
  const switchBtn = document.createElement("button");
  switchBtn.type = "button";
  switchBtn.id = `${instanceId}-btn`;
  switchBtn.className = "toggle-switch";
  switchBtn.setAttribute("role", "switch");
  const thumb = document.createElement("span");
  thumb.className = "toggle-thumb";
  thumb.setAttribute("aria-hidden", "true");
  switchBtn.appendChild(thumb);
  container.appendChild(textWrap);
  container.appendChild(switchBtn);
  let clickHandler = null;
  let keyHandler = null;
  function render() {
    labelEl.textContent = currentProps.label;
    if (currentProps.description) {
      descEl.textContent = currentProps.description;
      if (!textWrap.contains(descEl)) {
        textWrap.appendChild(descEl);
      }
      switchBtn.setAttribute("aria-describedby", descEl.id);
    } else {
      if (textWrap.contains(descEl)) {
        textWrap.removeChild(descEl);
      }
      switchBtn.removeAttribute("aria-describedby");
    }
    switchBtn.setAttribute("aria-labelledby", labelEl.id);
    switchBtn.setAttribute("aria-checked", currentProps.checked ? "true" : "false");
    if (currentProps.disabled) {
      switchBtn.disabled = true;
      switchBtn.setAttribute("aria-disabled", "true");
    } else {
      switchBtn.disabled = false;
      switchBtn.removeAttribute("aria-disabled");
    }
  }
  function toggle() {
    if (currentProps.disabled) return;
    const next = !currentProps.checked;
    currentProps.checked = next;
    render();
    currentProps.onChange?.(next);
  }
  function setupEvents() {
    if (clickHandler) switchBtn.removeEventListener("click", clickHandler);
    if (keyHandler) switchBtn.removeEventListener("keydown", keyHandler);
    clickHandler = (e) => {
      e.preventDefault();
      toggle();
    };
    keyHandler = (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggle();
      }
    };
    switchBtn.addEventListener("click", clickHandler);
    switchBtn.addEventListener("keydown", keyHandler);
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
      if (clickHandler) {
        switchBtn.removeEventListener("click", clickHandler);
        clickHandler = null;
      }
      if (keyHandler) {
        switchBtn.removeEventListener("keydown", keyHandler);
        keyHandler = null;
      }
    }
  };
}
export {
  Toggle
};
