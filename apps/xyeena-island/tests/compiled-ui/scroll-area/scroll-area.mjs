let scrollAreaIdCounter = 0;
function ScrollArea(initialProps = {}) {
  let currentProps = { ...initialProps };
  const container = document.createElement("div");
  container.id = currentProps.id || `xyn-scroll-${++scrollAreaIdCounter}`;
  container.className = `scroll-area ${currentProps.className || ""}`.trim();
  let resizeObserver = null;
  function updateScrollability() {
    const isScrollable = container.scrollHeight > container.clientHeight;
    if (isScrollable) {
      container.tabIndex = 0;
      container.setAttribute("role", "region");
      container.setAttribute("aria-label", "Scrollable content");
    } else {
      container.removeAttribute("tabIndex");
      container.removeAttribute("role");
      container.removeAttribute("aria-label");
    }
  }
  function render() {
    container.className = `scroll-area ${currentProps.className || ""}`.trim();
    if (currentProps.maxHeight) {
      container.style.maxHeight = currentProps.maxHeight;
    } else {
      container.style.maxHeight = "";
    }
    if (currentProps.content) {
      container.textContent = "";
      if (Array.isArray(currentProps.content)) {
        for (const child of currentProps.content) {
          container.appendChild(child);
        }
      } else {
        container.appendChild(currentProps.content);
      }
    }
    if (typeof ResizeObserver !== "undefined" && !resizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        updateScrollability();
      });
      resizeObserver.observe(container);
    } else {
      updateScrollability();
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
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      container.textContent = "";
    }
  };
}
export {
  ScrollArea
};
