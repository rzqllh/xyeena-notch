let rowIdCounter = 0;
function Row(initialProps) {
  let currentProps = { ...initialProps };
  const container = document.createElement("div");
  container.id = currentProps.id || `xyn-row-${++rowIdCounter}`;
  const left = document.createElement("div");
  left.className = "row-left";
  const leadingWrap = document.createElement("div");
  leadingWrap.className = "row-leading";
  const content = document.createElement("div");
  content.className = "row-content";
  const titleEl = document.createElement("span");
  titleEl.className = "row-title";
  const subtitleEl = document.createElement("p");
  subtitleEl.className = "row-subtitle";
  content.appendChild(titleEl);
  left.appendChild(leadingWrap);
  left.appendChild(content);
  const trailingWrap = document.createElement("div");
  trailingWrap.className = "row-trailing";
  container.appendChild(left);
  container.appendChild(trailingWrap);
  let clickHandler = null;
  let keyHandler = null;
  function render() {
    titleEl.textContent = currentProps.title;
    if (currentProps.subtitle) {
      subtitleEl.textContent = currentProps.subtitle;
      if (!content.contains(subtitleEl)) {
        content.appendChild(subtitleEl);
      }
    } else if (content.contains(subtitleEl)) {
      content.removeChild(subtitleEl);
    }
    leadingWrap.textContent = "";
    if (currentProps.leading) {
      leadingWrap.appendChild(currentProps.leading);
      leadingWrap.style.display = "flex";
    } else {
      leadingWrap.style.display = "none";
    }
    trailingWrap.textContent = "";
    if (currentProps.trailing) {
      trailingWrap.appendChild(currentProps.trailing);
      trailingWrap.style.display = "flex";
    } else {
      trailingWrap.style.display = "none";
    }
    const isInteractive = typeof currentProps.onClick === "function";
    container.className = `row-item ${isInteractive ? "interactive" : ""} ${currentProps.className || ""}`.trim();
    if (isInteractive) {
      container.tabIndex = 0;
      container.setAttribute("role", "button");
    } else {
      container.removeAttribute("tabIndex");
      container.removeAttribute("role");
    }
  }
  function setupEvents() {
    if (clickHandler) container.removeEventListener("click", clickHandler);
    if (keyHandler) container.removeEventListener("keydown", keyHandler);
    if (currentProps.onClick) {
      clickHandler = () => currentProps.onClick?.();
      keyHandler = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          currentProps.onClick?.();
        }
      };
      container.addEventListener("click", clickHandler);
      container.addEventListener("keydown", keyHandler);
    }
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
      setupEvents();
    },
    destroy() {
      if (clickHandler) {
        container.removeEventListener("click", clickHandler);
        clickHandler = null;
      }
      if (keyHandler) {
        container.removeEventListener("keydown", keyHandler);
        keyHandler = null;
      }
    }
  };
}
export {
  Row
};
