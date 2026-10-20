let popoverIdCounter = 0;
function Popover(initialProps) {
  let currentProps = { ...initialProps };
  const instanceId = currentProps.id || `xyn-popover-${++popoverIdCounter}`;
  const container = document.createElement("div");
  container.className = `popover-wrap ${currentProps.className || ""}`.trim();
  const panel = document.createElement("div");
  panel.id = `${instanceId}-panel`;
  panel.className = "popover-panel";
  panel.setAttribute("role", "region");
  let clickOutsideHandler = null;
  let keyHandler = null;
  let triggerClickHandler = null;
  function toggle() {
    const next = !currentProps.open;
    currentProps.open = next;
    render();
    currentProps.onOpenChange?.(next);
  }
  function close() {
    if (!currentProps.open) return;
    currentProps.open = false;
    render();
    currentProps.onOpenChange?.(false);
  }
  function setupGlobalListeners() {
    if (clickOutsideHandler) document.removeEventListener("click", clickOutsideHandler);
    if (keyHandler) document.removeEventListener("keydown", keyHandler);
    clickOutsideHandler = (e) => {
      if (!container.contains(e.target)) {
        close();
      }
    };
    keyHandler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("click", clickOutsideHandler);
    document.addEventListener("keydown", keyHandler);
  }
  function removeGlobalListeners() {
    if (clickOutsideHandler) {
      document.removeEventListener("click", clickOutsideHandler);
      clickOutsideHandler = null;
    }
    if (keyHandler) {
      document.removeEventListener("keydown", keyHandler);
      keyHandler = null;
    }
  }
  function render() {
    const isOpen = !!currentProps.open;
    currentProps.trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    currentProps.trigger.setAttribute("aria-haspopup", "true");
    currentProps.trigger.setAttribute("aria-controls", panel.id);
    panel.hidden = !isOpen;
    if (isOpen) {
      setupGlobalListeners();
    } else {
      removeGlobalListeners();
    }
  }
  container.appendChild(currentProps.trigger);
  panel.appendChild(currentProps.content);
  container.appendChild(panel);
  triggerClickHandler = (e) => {
    e.stopPropagation();
    toggle();
  };
  currentProps.trigger.addEventListener("click", triggerClickHandler);
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
      removeGlobalListeners();
      if (triggerClickHandler) {
        currentProps.trigger.removeEventListener("click", triggerClickHandler);
        triggerClickHandler = null;
      }
    }
  };
}
export {
  Popover
};
