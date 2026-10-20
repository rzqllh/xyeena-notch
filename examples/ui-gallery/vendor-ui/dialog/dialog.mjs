import { Button } from "../button/button.mjs";
import { IconButton } from "../icon-button/icon-button.mjs";
let dialogIdCounter = 0;
function Dialog(initialProps) {
  let currentProps = { ...initialProps };
  const instanceId = currentProps.id || `xyn-dialog-${++dialogIdCounter}`;
  let previouslyFocused = null;
  const backdrop = document.createElement("div");
  backdrop.className = `dialog-backdrop ${currentProps.className || ""}`.trim();
  const panel = document.createElement("div");
  panel.className = "dialog-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", `${instanceId}-title`);
  const header = document.createElement("div");
  header.className = "dialog-header";
  const titleGroup = document.createElement("div");
  titleGroup.className = "dialog-title-group";
  const titleEl = document.createElement("h2");
  titleEl.id = `${instanceId}-title`;
  titleEl.className = "dialog-title";
  const descEl = document.createElement("p");
  descEl.id = `${instanceId}-desc`;
  descEl.className = "dialog-desc";
  titleGroup.appendChild(titleEl);
  const closeBtn = IconButton({
    icon: "x",
    label: "Close dialog",
    size: "sm",
    onClick: () => {
      closeDialog();
    }
  });
  header.appendChild(titleGroup);
  header.appendChild(closeBtn.element);
  const body = document.createElement("div");
  body.className = "dialog-body";
  const footer = document.createElement("div");
  footer.className = "dialog-footer";
  const cancelBtn = Button({
    label: currentProps.cancelLabel || "Cancel",
    variant: "ghost",
    size: "sm",
    onClick: () => {
      currentProps.onCancel?.();
      closeDialog();
    }
  });
  const confirmBtn = Button({
    label: currentProps.confirmLabel || "Confirm",
    variant: currentProps.danger ? "danger" : "primary",
    size: "sm",
    onClick: () => {
      currentProps.onConfirm?.();
    }
  });
  footer.appendChild(cancelBtn.element);
  footer.appendChild(confirmBtn.element);
  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);
  backdrop.appendChild(panel);
  let keyHandler = null;
  function closeDialog() {
    backdrop.style.display = "none";
    currentProps.open = false;
    if (keyHandler) {
      document.removeEventListener("keydown", keyHandler);
      keyHandler = null;
    }
    if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      previouslyFocused.focus();
    }
  }
  function openDialog() {
    previouslyFocused = document.activeElement;
    backdrop.style.display = "flex";
    currentProps.open = true;
    keyHandler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDialog();
      }
    };
    document.addEventListener("keydown", keyHandler);
    confirmBtn.element.focus();
  }
  function render() {
    titleEl.textContent = currentProps.title;
    if (currentProps.description) {
      descEl.textContent = currentProps.description;
      if (!titleGroup.contains(descEl)) {
        titleGroup.appendChild(descEl);
      }
      panel.setAttribute("aria-describedby", descEl.id);
    } else {
      if (titleGroup.contains(descEl)) {
        titleGroup.removeChild(descEl);
      }
      panel.removeAttribute("aria-describedby");
    }
    body.textContent = "";
    if (currentProps.content) {
      body.appendChild(currentProps.content);
    }
    cancelBtn.update({ label: currentProps.cancelLabel || "Cancel" });
    confirmBtn.update({
      label: currentProps.confirmLabel || "Confirm",
      variant: currentProps.danger ? "danger" : "primary"
    });
    if (currentProps.open) {
      openDialog();
    } else {
      closeDialog();
    }
  }
  render();
  return {
    get element() {
      return backdrop;
    },
    update(nextProps) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    destroy() {
      if (keyHandler) {
        document.removeEventListener("keydown", keyHandler);
        keyHandler = null;
      }
      closeBtn.destroy();
      cancelBtn.destroy();
      confirmBtn.destroy();
      if (backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }
    }
  };
}
export {
  Dialog
};
