import { Icon } from "../icon/icon.mjs";
import { IconButton } from "../icon-button/icon-button.mjs";
let toastIdCounter = 0;
function Toast(initialProps) {
  let currentProps = { ...initialProps };
  const container = document.createElement("div");
  container.id = currentProps.id || `xyn-toast-${++toastIdCounter}`;
  let timer = null;
  let iconInstance = null;
  const msgEl = document.createElement("p");
  msgEl.className = "toast-msg";
  const closeBtn = IconButton({
    icon: "x",
    label: "Dismiss notification",
    size: "sm",
    onClick: () => {
      dismiss();
    }
  });
  function getVariantIcon(v) {
    if (v === "ok") return "check-circle";
    if (v === "warn") return "warning";
    if (v === "danger") return "x-circle";
    return "info";
  }
  function dismiss() {
    clearTimeout(timer);
    timer = null;
    currentProps.onDismiss?.();
  }
  function render() {
    const variant = currentProps.variant || "info";
    container.className = `toast-item toast-${variant} ${currentProps.className || ""}`.trim();
    container.setAttribute("role", variant === "danger" ? "alert" : "status");
    container.setAttribute("aria-live", variant === "danger" ? "assertive" : "polite");
    const iconName = getVariantIcon(variant);
    if (!iconInstance) {
      iconInstance = Icon({ name: iconName, size: 16 });
    } else {
      iconInstance.update({ name: iconName });
    }
    msgEl.textContent = currentProps.message;
    container.textContent = "";
    container.appendChild(iconInstance.element);
    container.appendChild(msgEl);
    container.appendChild(closeBtn.element);
    clearTimeout(timer);
    const dur = currentProps.duration !== void 0 ? currentProps.duration : 4e3;
    if (dur > 0) {
      timer = setTimeout(() => {
        dismiss();
      }, dur);
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
      clearTimeout(timer);
      timer = null;
      iconInstance?.destroy();
      iconInstance = null;
      closeBtn.destroy();
    }
  };
}
export {
  Toast
};
