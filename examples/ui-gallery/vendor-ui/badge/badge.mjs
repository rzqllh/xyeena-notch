import { Icon } from "../icon/icon.mjs";
function Badge(initialProps) {
  let currentProps = { ...initialProps };
  const span = document.createElement("span");
  let iconInstance = null;
  const labelSpan = document.createElement("span");
  labelSpan.className = "badge-label";
  function render() {
    span.className = `badge badge-${currentProps.variant || "default"} ${currentProps.className || ""}`.trim();
    labelSpan.textContent = currentProps.label;
    span.textContent = "";
    if (currentProps.icon) {
      if (!iconInstance) {
        iconInstance = Icon({ name: currentProps.icon, size: 12 });
      } else {
        iconInstance.update({ name: currentProps.icon, size: 12 });
      }
      span.appendChild(iconInstance.element);
    } else if (iconInstance) {
      iconInstance.destroy();
      iconInstance = null;
    }
    span.appendChild(labelSpan);
  }
  render();
  return {
    get element() {
      return span;
    },
    update(nextProps) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      iconInstance?.destroy();
      iconInstance = null;
    }
  };
}
export {
  Badge
};
