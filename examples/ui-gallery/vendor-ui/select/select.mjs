import { Icon } from "../icon/icon.mjs";
let selectIdCounter = 0;
function Select(initialProps) {
  let currentProps = { ...initialProps };
  const instanceId = currentProps.id || `xyn-select-${++selectIdCounter}`;
  const container = document.createElement("div");
  container.className = `select-wrap ${currentProps.className || ""}`.trim();
  const labelEl = document.createElement("label");
  labelEl.htmlFor = instanceId;
  labelEl.className = "select-label";
  const inputWrap = document.createElement("div");
  inputWrap.className = "select-input-wrap";
  const select = document.createElement("select");
  select.id = instanceId;
  select.className = "select-input";
  const arrowWrap = document.createElement("span");
  arrowWrap.className = "select-arrow";
  arrowWrap.setAttribute("aria-hidden", "true");
  const arrowIcon = Icon({ name: "caret-down", size: 14 });
  arrowWrap.appendChild(arrowIcon.element);
  inputWrap.appendChild(select);
  inputWrap.appendChild(arrowWrap);
  container.appendChild(labelEl);
  container.appendChild(inputWrap);
  let changeHandler = null;
  function render() {
    labelEl.textContent = currentProps.label;
    select.disabled = !!currentProps.disabled;
    select.textContent = "";
    for (const opt of currentProps.options) {
      const optEl = document.createElement("option");
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      if (opt.disabled) optEl.disabled = true;
      if (opt.value === currentProps.value) optEl.selected = true;
      select.appendChild(optEl);
    }
  }
  function setupEvents() {
    if (changeHandler) {
      select.removeEventListener("change", changeHandler);
    }
    changeHandler = (e) => {
      const val = e.target.value;
      currentProps.value = val;
      currentProps.onChange?.(val);
    };
    select.addEventListener("change", changeHandler);
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
      if (changeHandler) {
        select.removeEventListener("change", changeHandler);
        changeHandler = null;
      }
      arrowIcon.destroy();
    }
  };
}
export {
  Select
};
